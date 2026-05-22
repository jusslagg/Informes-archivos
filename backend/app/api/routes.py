from datetime import date, datetime
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
from app.services.storage import load_latest_dataset, save_latest_dataset
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
        raise HTTPException(status_code=400, detail="Formato no soportado. Usá Excel o CSV.")

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
        "ÁREA",
        "CLIENTE",
        "CAMPAÑA",
        "PUESTO",
        "MODALIDAD DE CONTRATACIÓN",
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
    campaign_column = _find_column(df, "CAMPAÑA", "CAMPANA")
    client_column = _find_column(df, "CLIENTE")
    estado_column = _find_column(df, "ESTADO")
    fecha_baja_column = _find_column(df, "FECHA BAJA")
    if not campaign_column:
        return {"rows": []}

    working = df.copy()
    working["_campana"] = working[campaign_column].astype(str).str.strip().replace("", "Sin dato")
    working["_cliente"] = working[client_column].astype(str).str.strip().replace("", "Sin dato") if client_column else "Sin dato"
    if not estado_column:
        counts = working.groupby(["_cliente", "_campana"], dropna=False).size().reset_index(name="activo")
        rows = [
            {
                "campana": str(row["_campana"]),
                "CAMPAÑA": str(row["_campana"]),
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
    is_activo = estado_upper.eq("ACTIVO") | (
        estado_upper.str.contains("ACTIVO", na=False) & ~estado_upper.str.contains("INACTIVO", na=False)
    )
    is_licencia = ~is_activo & ~is_baja
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
                "CAMPAÑA": str(campana),
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


@router.post("/staffing-by-campaign-legacy-disabled")
def get_staffing_by_campaign_legacy(payload: DynamicAnalysisRequest):
    df = _apply_filter_specs(_latest_df(), payload.filters)
    if "CAMPAÑA" not in df.columns:
        return {"rows": []}

    working = df.copy()
    working["CAMPAÑA"] = working["CAMPAÑA"].astype(str).replace("", "Sin dato")
    if "ESTADO" not in working.columns:
        counts = working.groupby("CAMPAÑA", dropna=False).size().reset_index(name="activo")
        rows = counts.sort_values("activo", ascending=False).to_dict(orient="records")
        return {"rows": rows}

    estado = working["ESTADO"].astype(str).str.strip()
    estado_upper = estado.str.upper()
    is_baja = estado_upper.str.contains("BAJA", na=False)
    is_activo = estado_upper.eq("ACTIVO") | (
        estado_upper.str.contains("ACTIVO", na=False) & ~estado_upper.str.contains("INACTIVO", na=False)
    )
    is_licencia = ~is_activo & ~is_baja

    rows = []
    enriched = working.assign(
        _is_activo=is_activo,
        _is_licencia=is_licencia,
        _estado=estado.replace("", "Sin dato"),
    )
    for campana, group in enriched.groupby("CAMPAÑA", dropna=False):
        licencia_group = group[group["_is_licencia"]]
        license_counts = licencia_group["_estado"].replace("", "Sin dato").value_counts()
        observacion = ", ".join(f"{label}: {count}" for label, count in license_counts.items())
        rows.append(
            {
                "CAMPAÑA": str(campana),
                "activo": int(group["_is_activo"].sum()),
                "licencia": int(len(licencia_group)),
                "observacion": observacion,
            }
        )

    rows = sorted(rows, key=lambda item: item["activo"], reverse=True)
    return {"rows": rows}


@router.post("/bajas-by-month")
def get_bajas_by_month(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(_only_bajas(_apply_filter_specs(_latest_df(), payload.filters)), payload.date_range)
    if "FECHA BAJA" not in df.columns or "CAMPAÑA" not in df.columns:
        return {"months": [], "rows": [], "totals": {}}

    working = df.copy()
    working["FECHA BAJA"] = pd.to_datetime(working["FECHA BAJA"], errors="coerce")
    working = working[working["FECHA BAJA"].notna()].copy()
    if working.empty:
        return {"months": [], "rows": [], "totals": {}}

    working["CAMPAÑA"] = working["CAMPAÑA"].astype(str).replace("", "Sin dato")
    working["_period"] = working["FECHA BAJA"].dt.to_period("M")
    periods = sorted(working["_period"].dropna().unique())
    month_keys = [str(period) for period in periods]
    month_labels = {
        str(period): MONTH_LABELS[int(period.month)]
        for period in periods
    }

    grouped = (
        working.groupby(["CAMPAÑA", "_period"], dropna=False)
        .size()
        .reset_index(name="cantidad")
    )

    rows = []
    for campana, group in grouped.groupby("CAMPAÑA", dropna=False):
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
    return {"months": [month_labels[key] for key in month_keys], "rows": rows, "totals": totals}


@router.post("/bajas-by-tenure")
def get_bajas_by_tenure(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(_only_bajas(_apply_filter_specs(_latest_df(), payload.filters)), payload.date_range)
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

    buckets = [
        ("Menos de 1 mes", working["_meses"].eq(0)),
        ("1 mes", working["_meses"].eq(1)),
        ("2 meses", working["_meses"].eq(2)),
        ("3 meses", working["_meses"].eq(3)),
        ("4 meses", working["_meses"].eq(4)),
        ("5 meses", working["_meses"].eq(5)),
        ("6 meses", working["_meses"].eq(6)),
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


@router.post("/bajas-by-reason")
def get_bajas_by_reason(payload: DynamicAnalysisRequest):
    df = _apply_fecha_baja_range(_only_bajas(_apply_filter_specs(_latest_df(), payload.filters)), payload.date_range)
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
    df = _apply_fecha_baja_range(_only_bajas(_apply_filter_specs(_latest_df(), payload.filters)), payload.date_range)
    campaign_column = _find_column(df, "CAMPAÑA", "CAMPANA")
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
        row = {"Campaña": str(campana)}
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
