from pathlib import Path

import pandas as pd

from app.core.columns import (
    CANONICAL_COLUMN_MAP,
    CORE_COLUMNS,
    INCLUDE_USER_COLUMNS,
    USER_COLUMNS,
    active_columns,
    normalize_column_name,
)

DATE_COLUMNS = ["FECHA ALTA", "FECHA BAJA", "FECHA NACIMIENTO"]
NUMERIC_COLUMNS = ["SALARIO", "CARGA HORARIA SEMANAL"]


def read_payroll_file(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in [".xlsx", ".xls"]:
        return pd.read_excel(path, dtype=str)
    if suffix == ".csv":
        last_error = None
        for encoding in ["utf-8-sig", "utf-8", "cp1252", "latin1"]:
            try:
                return pd.read_csv(path, dtype=str, sep=None, engine="python", encoding=encoding)
            except UnicodeDecodeError as exc:
                last_error = exc
        raise ValueError(f"No se pudo leer el CSV con UTF-8, Windows-1252 ni Latin-1: {last_error}")
    raise ValueError("Formato no soportado. Subí un archivo Excel o CSV.")


def clean_payroll(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    df = df.copy()
    rename_map = {}
    for column in df.columns:
        normalized = normalize_column_name(column)
        if normalized in CANONICAL_COLUMN_MAP:
            rename_map[column] = CANONICAL_COLUMN_MAP[normalized]
        elif "CLIENTE" in normalized:
            rename_map[column] = "CLIENTE"

    df = df.rename(columns=rename_map)
    missing_core = [column for column in CORE_COLUMNS if column not in df.columns]

    allowed = set(active_columns())
    if not INCLUDE_USER_COLUMNS:
        df = df.drop(columns=[column for column in USER_COLUMNS if column in df.columns], errors="ignore")

    df = df[[column for column in df.columns if column in allowed]]
    for column in active_columns():
        if column not in df.columns:
            df[column] = ""

    df = df[active_columns()]
    df = df.apply(lambda series: series.map(lambda value: str(value).strip() if pd.notna(value) else ""))

    for column in DATE_COLUMNS:
        if column in df.columns:
            parsed = pd.to_datetime(df[column], errors="coerce", dayfirst=True)
            df[column] = parsed.dt.strftime("%Y-%m-%d").fillna("")

    for column in NUMERIC_COLUMNS:
        if column in df.columns:
            normalized = (
                df[column]
                .astype(str)
                .str.replace(".", "", regex=False)
                .str.replace(",", ".", regex=False)
                .str.replace("$", "", regex=False)
                .str.strip()
            )
            df[column] = pd.to_numeric(normalized, errors="coerce").fillna(0)

    return df, missing_core
