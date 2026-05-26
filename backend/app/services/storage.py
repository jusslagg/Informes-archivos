from pathlib import Path
import json

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
