from datetime import date, datetime, timedelta
from pathlib import Path
import unicodedata

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
import pandas as pd
from sqlalchemy.orm import Session

from app.core.columns import CORE_COLUMNS, INCLUDE_USER_COLUMNS, OPTIONAL_COLUMNS, USER_COLUMNS
from app.core.settings import settings
from app.db.database import get_db
from app.db.models import UploadBatch
from app.schemas.analysis import DynamicAnalysisRequest, DynamicAnalysisResponse
from app.services.analysis import run_dynamic_analysis
from app.services.dashboard import build_dashboard
from app.services.exporter import export_workbook
from app.services.processor import clean_payroll, read_payroll_file
from app.services.storage import (
    append_requirements_history,
    load_holidays,
    load_latest_dataset,
    load_requirements,
    load_requirements_catalog,
    load_requirements_history,
    requirements_summary,
    save_holidays,
    save_latest_dataset,
    save_requirements,
    save_requirements_catalog,
)
from app.services.validations import validate_payroll

router = APIRouter()

MONTH_LABELS = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}

TENURE_BUCKETS = [
    ("Menos de 1 mes", 0),
    ("1 mes", 1),
    ("2 meses", 2),
    ("3 meses", 3),
    ("4 meses", 4),
    ("5 meses", 5),
    ("6 meses", 6),
]


@router.get("/requirements/{month}")
def get_saved_requirements(month: str):
    return load_requirements(month)


@router.put("/requirements/{month}")
def put_saved_requirements(month: str, payload: dict):
    return save_requirements(month, payload)


@router.get("/requirements-history")
def get_requirements_history():
    return load_requirements_history()


@router.post("/requirements-history")
def post_requirements_history(payload: dict):
    return append_requirements_history(payload)


@router.get("/requirements-catalog")
def get_saved_requirements_catalog():
    return load_requirements_catalog()


@router.put("/requirements-catalog")
def put_saved_requirements_catalog(payload: dict):
    return save_requirements_catalog(payload)


@router.get("/requirements-summary")
def get_requirements_summary(month: str | None = None):
    return requirements_summary(month)


@router.get("/holidays/{year}")
def get_saved_holidays(year: str):
    return load_holidays(year)


@router.put("/holidays/{year}")
def put_saved_holidays(year: str, payload: dict):
    return save_holidays(year, payload)


def _latest_df():
    try:
        return load_latest_dataset()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _apply_filter_specs(df, filters):
    working = df.copy()
    for filter_spec in filters:
        if filter_spec.column in working.columns and filter_spec.values:
            values = ["Sin dato" if value == "" else str(value) for value in filter_spec.values]
            series = working[filter_spec.column].astype(str).replace("", "Sin dato")
            working = working[series.isin(values)]
    return working


def _apply_fecha_baja_range(df, date_range):
    if not date_range or "FECHA BAJA" not in df.columns:
        return df
    working = df.copy()
    fecha_baja = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    if date_range.start:
        start = pd.to_datetime(date_range.start, errors="coerce")
        if pd.notna(start):
            working = working[fecha_baja >= start]
            fecha_baja = fecha_baja.loc[working.index]
    if date_range.end:
        end = pd.to_datetime(date_range.end, errors="coerce")
        if pd.notna(end):
            working = working[fecha_baja <= end]
    return working


def _month_end(day: date) -> date:
    if day.month == 12:
        return date(day.year, 12, 31)
    return date(day.year, day.month + 1, 1) - timedelta(days=1)


def _holiday_dates_for_year(year: int) -> set[str]:
    return {str(holiday.get("date")) for holiday in load_holidays(str(year)).get("holidays", []) if holiday.get("date")}


def _business_days_between(start: date, end: date, holiday_dates: set[str]) -> int:
    if end < start:
        return 0
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5 and current.isoformat() not in holiday_dates:
            total += 1
        current += timedelta(days=1)
    return total


def _normalize_column_name(value: str) -> str:
    return (
        unicodedata.normalize("NFD", str(value))
        .encode("ascii", "ignore")
        .decode("ascii")
        .upper()
        .strip()
    )


def _find_column(df: pd.DataFrame, *names: str) -> str | None:
    wanted = {_normalize_column_name(name) for name in names}
    for column in df.columns:
        if _normalize_column_name(column) in wanted:
            return column
    return None


def _exclude_filter_specs(filters, *columns):
    excluded = {_normalize_column_name(column) for column in columns}
    return [
        filter_spec
        for filter_spec in filters
        if _normalize_column_name(filter_spec.column) not in excluded
    ]


def _has_filter_spec(filters, *columns):
    wanted = {_normalize_column_name(column) for column in columns}
    return any(_normalize_column_name(filter_spec.column) in wanted for filter_spec in filters)


def _only_bajas(df):
    estado_column = _find_column(df, "ESTADO")
    if not estado_column:
        return df
    estado = df[estado_column].astype(str).map(_normalize_column_name)
    return df[estado.eq("BAJA")].copy()


@router.post("/upload")
async def upload_payroll(file: UploadFile = File(...), db: Session = Depends(get_db)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in [".xlsx", ".xls", ".csv"]:
        raise HTTPException(status_code=400, detail="Formato no soportado. UsÃ¡ Excel o CSV.")

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    destination = settings.upload_dir / f"{timestamp}_{file.filename}"
    destination.write_bytes(await file.read())

    try:
        raw_df = read_payroll_file(destination)
        clean_df, missing_core = clean_payroll(raw_df)
        issues = validate_payroll(clean_df, missing_core)
        save_latest_dataset(clean_df)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo procesar el archivo: {exc}") from exc

    batch = UploadBatch(
        original_filename=file.filename or "archivo",
        stored_path=str(destination),
        row_count=len(clean_df),
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    return {
        "batch_id": batch.id,
        "rows": len(clean_df),
        "columns": clean_df.columns.tolist(),
        "missing_core_columns": missing_core,
        "validations": issues,
        "dashboard": build_dashboard(clean_df),
    }


@router.get("/dashboard")
def get_dashboard():
    return build_dashboard(_latest_df())


@router.post("/dashboard")
def post_dashboard(payload: DynamicAnalysisRequest):
    return build_dashboard(_apply_filter_specs(_latest_df(), payload.filters))


@router.get("/validations")
def get_validations():
    df = _latest_df()
    return {"issues": validate_payroll(df)}


@router.post("/dynamic-analysis", response_model=DynamicAnalysisResponse)
def dynamic_analysis(payload: DynamicAnalysisRequest):
    return {"rows": run_dynamic_analysis(_latest_df(), payload)}


@router.get("/dataset-metadata")
def get_dataset_metadata():
    df = _latest_df()
    columns = []
    for column in df.columns:
        values = (
            df[column]
            .astype(str)
            .replace("", "Sin dato")
            .drop_duplicates()
            .sort_values()
            .head(5000)
            .tolist()
        )
        columns.append(
            {
                "name": column,
                "values": values,
                "unique_count": int(df[column].astype(str).nunique()),
            }
        )
    return {"columns": columns}


@router.post("/filter-options")
def get_filter_options(payload: DynamicAnalysisRequest):
    df = _latest_df()
    filtered = _apply_filter_specs(df, payload.filters)
    columns = []
    for column in df.columns:
        values = (
            filtered[column]
            .astype(str)
            .replace("", "Sin dato")
            .drop_duplicates()
            .sort_values()
            .head(5000)
            .tolist()
        )
        columns.append(
            {
                "name": column,
                "values": values,
                "available_count": len(values),
                "unique_count": int(filtered[column].astype(str).nunique()) if column in filtered else 0,
            }
        )
    return {"columns": columns, "rows": int(len(filtered))}


@router.post("/records")
def get_filtered_records(payload: DynamicAnalysisRequest):
    df = _apply_filter_specs(_latest_df(), payload.filters)
    preferred_columns = [
        "LEGAJO",
        "APELLIDOS",
        "NOMBRES",
        "DOCUMENTO",
        "ESTADO",
        "ÃREA",
        "CLIENTE",
        "CAMPAÃ‘A",
        "PUESTO",
        "MODALIDAD DE CONTRATACIÃ“N",
        "LOCALIDAD",
        "SITIO",
        "CARGA HORARIA SEMANAL",
        "SALARIO",
        "FECHA ALTA",
        "FECHA BAJA",
        "MOTIVO BAJA",
    ]
    columns = [column for column in preferred_columns if column in df.columns]
    if not columns:
        columns = df.columns.tolist()[:16]

    records = (
        df[columns]
        .head(500)
        .fillna("")
        .astype(str)
        .replace("", "Sin dato")
        .to_dict(orient="records")
    )
    return {"columns": columns, "rows": records, "total": int(len(df)), "limit": 500}


@router.post("/staffing-by-campaign")
def get_staffing_by_campaign(payload: DynamicAnalysisRequest):
    df = _apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))
    campaign_column = _find_column(df, "CAMPAÃ‘A", "CAMPANA")
    client_column = _find_column(df, "CLIENTE")
    estado_column = _find_column(df, "ESTADO")
    fecha_baja_column = _find_column(df, "FECHA BAJA")
    puesto_column = _find_column(df, "PUESTO")
    if not campaign_column:
        return {"rows": []}

    working = df.copy()
    if puesto_column and not _has_filter_spec(payload.filters, "PUESTO"):
        puesto = working[puesto_column].astype(str).map(_normalize_column_name)
        working = working[puesto.eq("OPERADOR")]

    working["_campana"] = working[campaign_column].astype(str).str.strip().replace("", "Sin dato")
    working["_cliente"] = working[client_column].astype(str).str.strip().replace("", "Sin dato") if client_column else "Sin dato"
    if not estado_column:
        counts = working.groupby(["_cliente", "_campana"], dropna=False).size().reset_index(name="activo")
        rows = [
            {
                "campana": str(row["_campana"]),
                "CAMPAÃ‘A": str(row["_campana"]),
                "cliente": str(row["_cliente"]),
                "CLIENTE": str(row["_cliente"]),
                "activo": int(row["activo"]),
                "bajasMes": 0,
                "licencia": 0,
                "observacion": "",
            }
            for row in counts.sort_values("activo", ascending=False).to_dict(orient="records")
        ]
        return {"rows": rows}

    estado = working[estado_column].astype(str).str.strip()
    estado_upper = estado.str.upper()
    is_baja = estado_upper.str.contains("BAJA", na=False)
    is_activo = estado_upper.eq("ACTIVO")
    is_pre_activo = estado_upper.str.replace("-", " ", regex=False).str.strip().eq("PRE ACTIVO")
    is_licencia = ~is_activo & ~is_baja & ~is_pre_activo
    bajas_mes = pd.Series(False, index=working.index)
    if fecha_baja_column:
        today = pd.Timestamp(date.today())
        month_start = today.replace(day=1)
        fecha_baja = pd.to_datetime(working[fecha_baja_column], errors="coerce", dayfirst=True)
        bajas_mes = is_baja & fecha_baja.ge(month_start) & fecha_baja.le(today)

    rows = []
    enriched = working.assign(
        _is_activo=is_activo,
        _is_baja_mes=bajas_mes,
        _is_licencia=is_licencia,
        _estado=estado.replace("", "Sin dato"),
    )
    for (cliente_value, campana), group in enriched.groupby(["_cliente", "_campana"], dropna=False):
        cliente_value = str(cliente_value or "Sin dato")
        licencia_group = group[group["_is_licencia"]]
        license_counts = licencia_group["_estado"].replace("", "Sin dato").value_counts()
        observacion = ", ".join(f"{label}: {count}" for label, count in license_counts.items())
        rows.append(
            {
                "campana": str(campana),
                "CAMPAÃ‘A": str(campana),
                "cliente": cliente_value,
                "CLIENTE": cliente_value,
                "activo": int(group["_is_activo"].sum()),
                "bajasMes": int(group["_is_baja_mes"].sum()),
                "licencia": int(len(licencia_group)),
                "observacion": observacion,
            }
        )

    rows = sorted(rows, key=lambda item: item["activo"], reverse=True)
    return {"rows": rows}


@router.post("/required-structure")
def get_required_structure(payload: DynamicAnalysisRequest):
    df = _apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))
    pcia_column = _find_column(df, "PCIA", "PROVINCIA")
    site_column = _find_column(df, "SITE", "SITIO")
    responsible_column = _find_column(df, "RESPONSABLE", "FORMADOR ASIGNADO", "SUPERVISOR")
    client_column = _find_column(df, "CLIENTE")
    campaign_column = _find_column(df, "CAMPAÃ‘A", "CAMPANA")
    subcampaign_column = _find_column(df, "SUB CAMPAÃ‘A", "SUB CAMPANA", "SUBCAMPAÃ‘A", "SUBCAMPANA")
    estado_column = _find_column(df, "ESTADO")
    hours_column = _find_column(df, "CARGA HORARIA SEMANAL")
    if not client_column and not campaign_column:
        return {"rows": []}

    working = df.copy()
    column_map = {
        "_pcia": pcia_column,
        "_site": site_column,
        "_responsable": responsible_column,
        "_cliente": client_column,
        "_campana": campaign_column,
        "_subcampana": subcampaign_column,
    }
    for target, source in column_map.items():
        if source:
            working[target] = working[source].astype(str).str.strip().replace("", "Sin dato")
        else:
            working[target] = "Sin dato"

    if estado_column:
        estado_upper = working[estado_column].astype(str).str.strip().str.upper()
        is_activo = estado_upper.eq("ACTIVO")
    else:
        is_activo = pd.Series(True, index=working.index)

    working["_is_activo"] = is_activo
    if hours_column:
        working["_weekly_hours"] = pd.to_numeric(
            working[hours_column].astype(str).str.replace(",", ".", regex=False),
            errors="coerce",
        ).fillna(0)
    else:
        working["_weekly_hours"] = 0

    rows = []
    group_columns = ["_pcia", "_site", "_responsable", "_cliente", "_campana", "_subcampana"]
    for values, group in working.groupby(group_columns, dropna=False):
        pcia, site, responsable, cliente, campana, subcampana = [str(value or "Sin dato") for value in values]
        active_group = group[group["_is_activo"]]
        rows.append(
            {
                "pcia": pcia,
                "site": site,
                "responsable": responsable,
                "cliente": cliente,
                "campana": campana,
                "subcampana": subcampana,
                "activo": int(active_group.shape[0]),
                "weekly_hours": float(active_group["_weekly_hours"].sum()),
            }
        )

    rows = sorted(rows, key=lambda item: (item["cliente"], item["campana"], item["subcampana"]))
    return {"rows": rows}


@router.post("/staffing-by-campaign-legacy-disabled")
def get_staffing_by_campaign_legacy(payload: DynamicAnalysisRequest):
    df = _apply_filter_specs(_latest_df(), payload.filters)
    if "CAMPAÃ‘A" not in df.columns:
        return {"rows": []}

    working = df.copy()
    working["CAMPAÃ‘A"] = working["CAMPAÃ‘A"].astype(str).replace("", "Sin dato")
    if "ESTADO" not in working.columns:
        counts = working.groupby("CAMPAÃ‘A", dropna=False).size().reset_index(name="activo")
        rows = counts.sort_values("activo", ascending=False).to_dict(orient="records")
        return {"rows": rows}

    estado = working["ESTADO"].astype(str).str.strip()
    estado_upper = estado.str.upper()
    is_baja = estado_upper.str.contains("BAJA", na=False)
    is_activo = estado_upper.eq("ACTIVO")
    is_pre_activo = estado_upper.str.replace("-", " ", regex=False).str.strip().eq("PRE ACTIVO")
    is_licencia = ~is_activo & ~is_baja & ~is_pre_activo

    rows = []
    enriched = working.assign(
        _is_activo=is_activo,
        _is_licencia=is_licencia,
        _estado=estado.replace("", "Sin dato"),
    )
    for campana, group in enriched.groupby("CAMPAÃ‘A", dropna=False):
        licencia_group = group[group["_is_licencia"]]
        license_counts = licencia_group["_estado"].replace("", "Sin dato").value_counts()
        observacion = ", ".join(f"{label}: {count}" for label, count in license_counts.items())
        rows.append(
            {
                "CAMPAÃ‘A": str(campana),
                "activo": int(group["_is_activo"].sum()),
                "licencia": int(len(licencia_group)),
                "observacion": observacion,
            }
        )

    rows = sorted(rows, key=lambda item: item["activo"], reverse=True)
    return {"rows": rows}


@router.post("/bajas-by-month")
def get_bajas_by_month(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    campaign_column = _find_column(df, "CAMPAÑA", "CAMPANA")
    if "FECHA BAJA" not in df.columns or not campaign_column:
        return {"months": [], "rows": [], "totals": {}, "hourRows": [], "hourTotals": {}, "hourEvents": [], "holidayDates": [], "hoursPerBusinessDay": 6}

    working = df.copy()
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"months": [], "rows": [], "totals": {}, "hourRows": [], "hourTotals": {}, "hourEvents": [], "holidayDates": [], "hoursPerBusinessDay": 6}

    working["_campana"] = working[campaign_column].astype(str).replace("", "Sin dato")
    working["_period"] = working["FECHA BAJA"].dt.to_period("M")
    periods = sorted(working["_period"].dropna().unique())
    month_keys = [str(period) for period in periods]
    month_labels = {
        str(period): f"{MONTH_LABELS[int(period.month)]} {int(period.year)}"
        for period in periods
    }

    grouped = (
        working.groupby(["_campana", "_period"], dropna=False)
        .size()
        .reset_index(name="cantidad")
    )

    rows = []
    for campana, group in grouped.groupby("_campana", dropna=False):
        row = {"Campaña": str(campana)}
        total = 0
        for period_key in month_keys:
            value = int(group.loc[group["_period"].astype(str).eq(period_key), "cantidad"].sum())
            row[month_labels[period_key]] = value
            total += value
        row["Total"] = total
        rows.append(row)

    totals = {}
    for period_key in month_keys:
        totals[month_labels[period_key]] = int(
            grouped.loc[grouped["_period"].astype(str).eq(period_key), "cantidad"].sum()
        )
    totals["Total"] = int(sum(totals.values()))
    rows = sorted(rows, key=lambda item: item["Total"], reverse=True)

    holidays_by_year: dict[int, set[str]] = {}
    hour_groups: dict[tuple[str, str], dict] = {}
    hour_events = []
    for _, item in working.iterrows():
        fecha_baja = item["FECHA BAJA"].date()
        period_key = str(item["_period"])
        campana = str(item["_campana"] or "Sin dato")
        holiday_dates = holidays_by_year.setdefault(fecha_baja.year, _holiday_dates_for_year(fecha_baja.year))
        start = date(fecha_baja.year, fecha_baja.month, 1)
        end = _month_end(fecha_baja)
        business_days_month = _business_days_between(start, end, holiday_dates)
        worked_days = _business_days_between(start, fecha_baja, holiday_dates)
        missing_days = max(business_days_month - worked_days, 0)
        key = (campana, period_key)
        current = hour_groups.setdefault(
            key,
            {
                "Campaña": campana,
                "Mes": month_labels[period_key],
                "Bajas": 0,
                "Días hábiles mes": business_days_month,
                "Días hábiles trabajados": 0,
                "Días diferencia": 0,
                "Horas trabajadas": 0,
                "Diferencia horas": 0,
            },
        )
        current["Bajas"] += 1
        current["Días hábiles trabajados"] += worked_days
        current["Días diferencia"] += missing_days
        current["Horas trabajadas"] += worked_days * 6
        current["Diferencia horas"] += missing_days * 6
        hour_events.append({"Campaña": campana, "Mes": month_labels[period_key], "Fecha baja": fecha_baja.isoformat()})

    hour_rows = sorted(hour_groups.values(), key=lambda item: (item["Mes"], -item["Diferencia horas"], item["Campaña"]))
    hour_totals = {
        "Bajas": int(sum(row["Bajas"] for row in hour_rows)),
        "Días hábiles trabajados": int(sum(row["Días hábiles trabajados"] for row in hour_rows)),
        "Días diferencia": int(sum(row["Días diferencia"] for row in hour_rows)),
        "Horas trabajadas": int(sum(row["Horas trabajadas"] for row in hour_rows)),
        "Diferencia horas": int(sum(row["Diferencia horas"] for row in hour_rows)),
    }

    return {
        "months": [month_labels[key] for key in month_keys],
        "rows": rows,
        "totals": totals,
        "hourRows": hour_rows,
        "hourTotals": hour_totals,
        "hourEvents": hour_events,
        "holidayDates": sorted(date for dates in holidays_by_year.values() for date in dates),
        "hoursPerBusinessDay": 6,
    }

@router.post("/bajas-by-tenure")
def get_bajas_by_tenure(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    if "FECHA ALTA" not in df.columns or "FECHA BAJA" not in df.columns:
        return {"rows": [], "total": 0}

    working = df.copy()
    working["FECHA ALTA"] = pd.to_datetime(working["FECHA ALTA"], errors="coerce")
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA ALTA"].notna() & working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"rows": [], "total": 0}

    tenure_days = (working["FECHA BAJA"] - working["FECHA ALTA"]).dt.days
    working = working[tenure_days >= 0].copy()
    working["_meses"] = ((working["FECHA BAJA"].dt.year - working["FECHA ALTA"].dt.year) * 12) + (
        working["FECHA BAJA"].dt.month - working["FECHA ALTA"].dt.month
    )
    working.loc[working["FECHA BAJA"].dt.day < working["FECHA ALTA"].dt.day, "_meses"] -= 1
    working["_meses"] = working["_meses"].clip(lower=0).astype(int)

    buckets = [(label, working["_meses"].eq(month)) for label, month in TENURE_BUCKETS] + [
        ("Mayor a 6 meses", working["_meses"].gt(6)),
    ]
    rows = [
        {
            "Antigüedad": label,
            "Bajas": int(mask.sum()),
        }
        for label, mask in buckets
    ]
    total = sum(row["Bajas"] for row in rows)
    return {"rows": rows, "total": int(total)}


@router.post("/bajas-tenure-by-month")
def get_bajas_tenure_by_month(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    if "FECHA ALTA" not in df.columns or "FECHA BAJA" not in df.columns:
        return {"months": [], "rows": [], "totals": {}}

    working = df.copy()
    working["FECHA ALTA"] = pd.to_datetime(working["FECHA ALTA"], errors="coerce")
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA ALTA"].notna() & working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"months": [], "rows": [], "totals": {}}

    tenure_days = (working["FECHA BAJA"] - working["FECHA ALTA"]).dt.days
    working = working[tenure_days >= 0].copy()
    if working.empty:
        return {"months": [], "rows": [], "totals": {}}

    working["_meses"] = ((working["FECHA BAJA"].dt.year - working["FECHA ALTA"].dt.year) * 12) + (
        working["FECHA BAJA"].dt.month - working["FECHA ALTA"].dt.month
    )
    working.loc[working["FECHA BAJA"].dt.day < working["FECHA ALTA"].dt.day, "_meses"] -= 1
    working["_meses"] = working["_meses"].clip(lower=0).astype(int)
    working["_tramo"] = working["_meses"].apply(lambda value: TENURE_BUCKETS[value][0] if value <= 6 else "Mayor a 6 meses")
    working["_period"] = working["FECHA BAJA"].dt.to_period("M")

    periods = sorted(working["_period"].dropna().unique())
    month_keys = [str(period) for period in periods]
    month_labels = {str(period): f"{MONTH_LABELS[int(period.month)]} {int(period.year)}" for period in periods}
    bucket_labels = [label for label, _ in TENURE_BUCKETS] + ["Mayor a 6 meses"]

    rows = []
    totals = {month_labels[key]: 0 for key in month_keys}
    totals["Total"] = 0
    for label in bucket_labels:
        group = working[working["_tramo"].eq(label)]
        row = {"Antigüedad": label}
        total = 0
        for period_key in month_keys:
            value = int(group["_period"].astype(str).eq(period_key).sum())
            row[month_labels[period_key]] = value
            totals[month_labels[period_key]] += value
            total += value
        row["Total"] = total
        totals["Total"] += total
        rows.append(row)

    return {"months": [month_labels[key] for key in month_keys], "rows": rows, "totals": totals}


@router.post("/bajas-by-owner-month")
def get_bajas_by_owner_month(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    if "FECHA BAJA" not in df.columns:
        return {"months": [], "leader": {"label": "Líder", "rows": [], "totals": {}}, "supervisor": {"label": "Supervisor", "rows": [], "totals": {}}}

    leader_column = _find_column(df, "LÍDER", "LIDER", "JEFE", "JEFE DE EQUIPO", "EQUIPO")
    supervisor_column = _find_column(df, "SUPERVISOR", "FORMADOR ASIGNADO", "RESPONSABLE")
    working = df.copy()
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"months": [], "leader": {"label": leader_column or "Líder", "rows": [], "totals": {}}, "supervisor": {"label": supervisor_column or "Supervisor", "rows": [], "totals": {}}}

    working["_period"] = working["FECHA BAJA"].dt.to_period("M")
    periods = sorted(working["_period"].dropna().unique())
    month_keys = [str(period) for period in periods]
    month_labels = {str(period): f"{MONTH_LABELS[int(period.month)]} {int(period.year)}" for period in periods}

    def build_scope(column, fallback_label):
        if not column:
            return {"label": fallback_label, "rows": [], "totals": {}}
        grouped = working.copy()
        grouped["_owner"] = grouped[column].astype(str).str.strip().replace("", "Sin dato")
        rows = []
        totals = {month_labels[key]: 0 for key in month_keys}
        totals["Total"] = 0
        for owner, group in grouped.groupby("_owner", dropna=False):
            row = {"Responsable": str(owner)}
            total = 0
            for period_key in month_keys:
                value = int(group["_period"].astype(str).eq(period_key).sum())
                row[month_labels[period_key]] = value
                totals[month_labels[period_key]] += value
                total += value
            row["Total"] = total
            totals["Total"] += total
            rows.append(row)
        rows = sorted(rows, key=lambda item: item["Total"], reverse=True)
        return {"label": column, "rows": rows, "totals": totals}

    return {
        "months": [month_labels[key] for key in month_keys],
        "leader": build_scope(leader_column, "Líder"),
        "supervisor": build_scope(supervisor_column, "Supervisor"),
    }


@router.post("/bajas-reason-by-tenure")
def get_bajas_reason_by_tenure(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    reason_column = _find_column(df, "MOTIVO BAJA")
    campaign_column = _find_column(df, "CAMPAÃ‘A", "CAMPANA")
    if "FECHA ALTA" not in df.columns or "FECHA BAJA" not in df.columns or not reason_column:
        return {"reasons": [], "rows": [], "totals": {}, "campaigns": [], "byCampaign": {}}

    working = df.copy()
    working["FECHA ALTA"] = pd.to_datetime(working["FECHA ALTA"], errors="coerce")
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA ALTA"].notna() & working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"reasons": [], "rows": [], "totals": {}, "campaigns": [], "byCampaign": {}}

    tenure_days = (working["FECHA BAJA"] - working["FECHA ALTA"]).dt.days
    working = working[tenure_days >= 0].copy()
    if working.empty:
        return {"reasons": [], "rows": [], "totals": {}, "campaigns": [], "byCampaign": {}}

    working["_meses"] = ((working["FECHA BAJA"].dt.year - working["FECHA ALTA"].dt.year) * 12) + (
        working["FECHA BAJA"].dt.month - working["FECHA ALTA"].dt.month
    )
    working.loc[working["FECHA BAJA"].dt.day < working["FECHA ALTA"].dt.day, "_meses"] -= 1
    working["_meses"] = working["_meses"].clip(lower=0).astype(int)
    working["_tramo"] = working["_meses"].apply(lambda value: TENURE_BUCKETS[value][0] if value <= 6 else "Mayor a 6 meses")
    working["_motivo"] = working[reason_column].astype(str).str.strip().replace("", "Sin dato")
    if campaign_column:
        working["_campana"] = working[campaign_column].astype(str).str.strip().replace("", "Sin dato")
    else:
        working["_campana"] = "Sin dato"

    reason_totals = working["_motivo"].value_counts()
    reasons = [str(reason) for reason in reason_totals.index]
    totals = {str(reason): int(count) for reason, count in reason_totals.items()}
    totals["Total"] = int(reason_totals.sum())

    bucket_labels = [label for label, _ in TENURE_BUCKETS] + ["Mayor a 6 meses"]

    def build_tenure_rows(scope):
        scope_rows = []
        for label in bucket_labels:
            group = scope[scope["_tramo"].eq(label)]
            row = {"AntigÃ¼edad": label, "Total": int(len(group))}
            counts = group["_motivo"].value_counts()
            for reason in reasons:
                row[reason] = int(counts.get(reason, 0))
            scope_rows.append(row)
        return scope_rows

    def build_totals(scope):
        counts = scope["_motivo"].value_counts()
        scope_totals = {str(reason): int(counts.get(reason, 0)) for reason in reasons}
        scope_totals["Total"] = int(counts.sum())
        return scope_totals

    by_campaign = {}
    campaigns = []
    for campana, group in working.groupby("_campana", dropna=False):
        campaign_name = str(campana)
        campaign_total = int(len(group))
        campaigns.append({"name": campaign_name, "total": campaign_total})
        by_campaign[campaign_name] = {
            "rows": build_tenure_rows(group),
            "totals": build_totals(group),
        }
    campaigns = sorted(campaigns, key=lambda item: item["total"], reverse=True)

    return {
        "reasons": reasons,
        "rows": build_tenure_rows(working),
        "totals": totals,
        "campaigns": campaigns,
        "byCampaign": by_campaign,
    }


@router.post("/bajas-by-reason")
def get_bajas_by_reason(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    if "FECHA BAJA" not in df.columns or "MOTIVO BAJA" not in df.columns:
        return {"rows": [], "total": 0}

    working = df.copy()
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"rows": [], "total": 0}

    counts = (
        working["MOTIVO BAJA"]
        .astype(str)
        .str.strip()
        .replace("", "Sin dato")
        .value_counts()
    )
    rows = [
        {
            "Motivo": str(motivo),
            "Bajas": int(cantidad),
        }
        for motivo, cantidad in counts.items()
    ]
    total = int(counts.sum())
    return {"rows": rows, "total": total}


@router.post("/bajas-reason-by-campaign")
def get_bajas_reason_by_campaign(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(
        _only_bajas(_apply_filter_specs(_latest_df(), _exclude_filter_specs(payload.filters, "ESTADO"))),
        payload.date_range,
    )
    campaign_column = _find_column(df, "CAMPAÃ‘A", "CAMPANA")
    reason_column = _find_column(df, "MOTIVO BAJA")
    fecha_baja_column = _find_column(df, "FECHA BAJA")
    if not campaign_column or not reason_column or not fecha_baja_column:
        return {"reasons": [], "rows": [], "totals": {}}

    working = df.copy()
    working[fecha_baja_column] = pd.to_datetime(working[fecha_baja_column], errors="coerce")
    working = working[working[fecha_baja_column].notna()].copy()
    if working.empty:
        return {"reasons": [], "rows": [], "totals": {}}

    working["_campana"] = working[campaign_column].astype(str).str.strip().replace("", "Sin dato")
    working["_motivo"] = working[reason_column].astype(str).str.strip().replace("", "Sin dato")
    grouped = (
        working.groupby(["_campana", "_motivo"], dropna=False)
        .size()
        .reset_index(name="cantidad")
    )
    reasons = grouped.groupby("_motivo")["cantidad"].sum().sort_values(ascending=False).index.tolist()

    rows = []
    for campana, group in grouped.groupby("_campana", dropna=False):
        row = {"CampaÃ±a": str(campana)}
        total = 0
        for reason in reasons:
            value = int(group.loc[group["_motivo"].eq(reason), "cantidad"].sum())
            row[str(reason)] = value
            total += value
        row["Total"] = total
        rows.append(row)

    totals = {}
    for reason in reasons:
        totals[str(reason)] = int(grouped.loc[grouped["_motivo"].eq(reason), "cantidad"].sum())
    totals["Total"] = int(sum(totals.values()))
    rows = sorted(rows, key=lambda item: item["Total"], reverse=True)
    return {"reasons": [str(reason) for reason in reasons], "rows": rows, "totals": totals}


@router.get("/export")
def export_analysis():
    df = _latest_df()
    dashboard = build_dashboard(df)
    validations = validate_payroll(df)
    path = export_workbook(df, dashboard, validations)
    return FileResponse(
        path,
        filename="analisis_nomina.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/columns")
def get_columns_config():
    return {
        "core": CORE_COLUMNS,
        "optional": OPTIONAL_COLUMNS,
        "user": USER_COLUMNS,
        "include_user_columns": INCLUDE_USER_COLUMNS,
    }

