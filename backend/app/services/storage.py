from datetime import date
from pathlib import Path
import json
import re
import unicodedata

import pandas as pd

from app.core.settings import settings

DEFAULT_HOLIDAYS = {
    "2026": [
        {"date": "2026-01-01", "label": "Año nuevo"},
        {"date": "2026-02-16", "label": "Carnaval"},
        {"date": "2026-02-17", "label": "Carnaval"},
        {"date": "2026-03-24", "label": "Día Nacional de la Memoria por la Verdad y la Justicia"},
        {"date": "2026-04-02", "label": "Día del Veterano y de los Caídos en la Guerra de Malvinas"},
        {"date": "2026-04-03", "label": "Viernes Santo"},
        {"date": "2026-05-01", "label": "Día del Trabajador"},
        {"date": "2026-05-25", "label": "Día de la Revolución de Mayo"},
        {"date": "2026-06-15", "label": "Paso a la Inmortalidad del General Martín Güemes (17/6)"},
        {"date": "2026-06-20", "label": "Paso a la Inmortalidad del General Manuel Belgrano"},
        {"date": "2026-07-09", "label": "Día de la Independencia"},
        {"date": "2026-08-17", "label": "Paso a la Inmortalidad del Gral. José de San Martín"},
        {"date": "2026-10-12", "label": "Día del Respeto a la Diversidad Cultural"},
        {"date": "2026-11-23", "label": "Día de la Soberanía Nacional (20/11)"},
        {"date": "2026-12-08", "label": "Día de la Inmaculada Concepción de María"},
        {"date": "2026-12-25", "label": "Navidad"},
    ],
}


def default_holidays_for_year(year: str) -> list[dict]:
    return DEFAULT_HOLIDAYS.get(str(year), [])


def merge_default_holidays(year: str, holidays: list[dict]) -> list[dict]:
    merged = {holiday["date"]: holiday for holiday in default_holidays_for_year(year)}
    for holiday in holidays or []:
        date = holiday.get("date")
        if date:
            merged[date] = holiday
    return sorted(merged.values(), key=lambda holiday: holiday["date"])


def save_latest_dataset(df: pd.DataFrame) -> None:
    df.to_csv(settings.latest_dataset, index=False, encoding="utf-8-sig")


def load_latest_dataset() -> pd.DataFrame:
    if not Path(settings.latest_dataset).exists():
        raise FileNotFoundError("Todavía no se importó ninguna nómina.")
    return pd.read_csv(settings.latest_dataset, dtype=str).fillna("")


def requirements_path(month: str) -> Path:
    safe_month = "".join(char for char in str(month) if char.isdigit() or char == "-") or "current"
    return settings.export_dir.parent / f"requirements_{safe_month}.json"


def holidays_path(year: str) -> Path:
    safe_year = "".join(char for char in str(year) if char.isdigit())[:4] or "current"
    return settings.export_dir.parent / f"holidays_{safe_year}.json"


def requirements_catalog_path() -> Path:
    return settings.export_dir.parent / "requirements_catalog.json"


def available_requirement_months() -> list[str]:
    storage_dir = settings.export_dir.parent
    return sorted(
        path.stem.replace("requirements_", "")
        for path in storage_dir.glob("requirements_????-??.json")
        if path.stem != "requirements_catalog"
    )


def _parse_required_number(value) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
        text = text.replace(".", "")
    try:
        return float(text) if text else 0
    except ValueError:
        return 0


def _normalize_key(value) -> str:
    return (
        unicodedata.normalize("NFD", str(value or ""))
        .encode("ascii", "ignore")
        .decode("ascii")
        .strip()
        .lower()
    )


def _account_key(row: dict) -> str:
    return "||".join(
        _normalize_key(row.get(field))
        for field in ["gerente", "jefeSite", "cliente", "campana", "subcampana"]
    )


def _active_catalog_keys() -> set[str]:
    catalog = load_requirements_catalog()
    return {
        _account_key(row)
        for row in catalog.get("rows") or []
        if row.get("active") is not False and _account_key(row).strip("|")
    }


def _weekday_key(day_key: str) -> bool:
    try:
        year, month, day = [int(part) for part in str(day_key).split("-")]
        return date(year, month, day).weekday() < 5
    except ValueError:
        return False


def _summary_label(row: dict) -> str:
    subcampaign = str(row.get("subcampana") or "").strip()
    campaign = str(row.get("campana") or "").strip()
    return subcampaign or campaign or "Sin dato"


def requirements_summary(month: str | None = None) -> dict:
    months = available_requirement_months()
    selected_month = month if month in months else (months[-1] if months else "")
    if not selected_month:
        return {"months": [], "month": "", "rows": [], "totals": {"required": 0, "hours": 0}}

    saved = load_requirements(selected_month)
    catalog_keys = _active_catalog_keys()
    has_catalog = bool(catalog_keys)
    leaf_totals = {}
    for row in saved.get("rows") or []:
        if row.get("active") is False:
            continue
        if has_catalog and _account_key(row) not in catalog_keys:
            continue
        weekday_values = [
            _parse_required_number(value)
            for day, value in (row.get("daily") or {}).items()
            if str(day).startswith(selected_month) and _weekday_key(day)
        ]
        required = max(weekday_values) if weekday_values else 0
        if required <= 0:
            continue
        manager = str(row.get("gerente") or "Sin dato").strip() or "Sin dato"
        site_lead = str(row.get("jefeSite") or "Sin dato").strip() or "Sin dato"
        client = str(row.get("cliente") or "Sin dato").strip() or "Sin dato"
        label = _summary_label(row)
        leaf_key = (manager, site_lead, client, label)
        leaf_totals[leaf_key] = max(leaf_totals.get(leaf_key, 0), required)

    leaves = [
        {
            "manager": manager,
            "siteLead": site_lead,
            "client": client,
            "label": label,
            "required": required,
            "hours": round(required * 120),
        }
        for (manager, site_lead, client, label), required in leaf_totals.items()
    ]

    manager_totals = {}
    site_totals = {}
    client_totals = {}
    for item in leaves:
        manager_totals[item["manager"]] = manager_totals.get(item["manager"], 0) + item["required"]
        site_key = (item["manager"], item["siteLead"])
        site_totals[site_key] = site_totals.get(site_key, 0) + item["required"]
        client_key = (item["manager"], item["siteLead"], item["client"])
        client_totals[client_key] = client_totals.get(client_key, 0) + item["required"]

    rows = []
    for manager in sorted(manager_totals, key=lambda key: manager_totals[key], reverse=True):
        manager_required = manager_totals[manager]
        manager_id = f"manager::{_normalize_key(manager)}"
        rows.append(
            {
                "id": manager_id,
                "parentId": None,
                "level": 0,
                "type": "Gerente",
                "label": manager,
                "required": manager_required,
                "hours": round(manager_required * 120),
            }
        )
        site_leads = sorted(
            (site_lead for (item_manager, site_lead) in site_totals if item_manager == manager),
            key=lambda site_lead: site_totals[(manager, site_lead)],
            reverse=True,
        )
        for site_lead in site_leads:
            site_required = site_totals[(manager, site_lead)]
            site_id = f"{manager_id}::site::{_normalize_key(site_lead)}"
            rows.append(
                {
                    "id": site_id,
                    "parentId": manager_id,
                    "level": 1,
                    "type": "Jefe de site",
                    "label": site_lead,
                    "required": site_required,
                    "hours": round(site_required * 120),
                }
            )
            clients = sorted(
                (client for (item_manager, item_site, client) in client_totals if item_manager == manager and item_site == site_lead),
                key=lambda client: client_totals[(manager, site_lead, client)],
                reverse=True,
            )
            for client in clients:
                client_required = client_totals[(manager, site_lead, client)]
                client_id = f"{site_id}::client::{_normalize_key(client)}"
                rows.append(
                    {
                        "id": client_id,
                        "parentId": site_id,
                        "level": 2,
                        "type": "Cliente",
                        "label": client,
                        "required": client_required,
                        "hours": round(client_required * 120),
                    }
                )
                for leaf in sorted(
                    (
                        item
                        for item in leaves
                        if item["manager"] == manager and item["siteLead"] == site_lead and item["client"] == client
                    ),
                    key=lambda item: item["required"],
                    reverse=True,
                ):
                    leaf_id = f"{client_id}::service::{_normalize_key(leaf['label'])}"
                    rows.append(
                        {
                            "id": leaf_id,
                            "parentId": client_id,
                            "level": 3,
                            "type": "Servicio",
                            "label": leaf["label"],
                            "required": leaf["required"],
                            "hours": leaf["hours"],
                        }
                )

    total_required = sum(manager_totals.values())
    return {
        "months": months,
        "month": selected_month,
        "rows": rows,
        "totals": {"required": total_required, "hours": round(total_required * 120)},
        "source": {
            "activeAccounts": len(catalog_keys),
            "usesCatalog": has_catalog,
        },
    }


def load_requirements(month: str) -> dict:
    path = requirements_path(month)
    if not path.exists():
        return {
            "month": month,
            "requirements": {},
            "holidays": {},
            "manualRows": [],
            "masterRequirements": {},
            "rows": [],
            "draft": {},
        }
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {
            "month": month,
            "requirements": {},
            "holidays": {},
            "manualRows": [],
            "masterRequirements": {},
            "rows": [],
            "draft": {},
        }


def save_requirements(month: str, payload: dict) -> dict:
    data = {
        "month": month,
        "requirements": payload.get("requirements") or {},
        "holidays": payload.get("holidays") or {},
        "manualRows": payload.get("manualRows") or [],
        "masterRequirements": payload.get("masterRequirements") or {},
        "rows": payload.get("rows") or [],
        "draft": payload.get("draft") or {},
    }
    path = requirements_path(month)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def load_requirements_catalog() -> dict:
    path = requirements_catalog_path()
    if not path.exists():
        return {"rows": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {"rows": data.get("rows") or []}
    except json.JSONDecodeError:
        return {"rows": []}


def save_requirements_catalog(payload: dict) -> dict:
    data = {"rows": payload.get("rows") or []}
    path = requirements_catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def load_holidays(year: str) -> dict:
    path = holidays_path(year)
    if not path.exists():
        return {"year": year, "holidays": default_holidays_for_year(year)}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["year"] = year
        data["holidays"] = merge_default_holidays(year, data.get("holidays") or [])
        return data
    except json.JSONDecodeError:
        return {"year": year, "holidays": default_holidays_for_year(year)}


def save_holidays(year: str, payload: dict) -> dict:
    data = {"year": year, "holidays": payload.get("holidays") or []}
    path = holidays_path(year)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
