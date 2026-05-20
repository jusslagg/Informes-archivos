from typing import Any

import pandas as pd

from app.core.columns import CORE_COLUMNS

REQUIRED_NOT_EMPTY = [
    "LEGAJO",
    "APELLIDOS",
    "NOMBRES",
    "DOCUMENTO",
    "FECHA ALTA",
    "ESTADO",
    "ÁREA",
    "CLIENTE",
    "CAMPAÑA",
    "SALARIO",
]


def build_issue(issue_type: str, severity: str, message: str, rows: list[int] | None = None) -> dict[str, Any]:
    return {
        "type": issue_type,
        "severity": severity,
        "message": message,
        "rows": rows or [],
        "count": len(rows or []),
    }


def validate_payroll(df: pd.DataFrame, missing_core: list[str] | None = None) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    missing_core = missing_core or [column for column in CORE_COLUMNS if column not in df.columns]

    if missing_core:
        issues.append(
            build_issue(
                "missing_columns",
                "error",
                f"Faltan columnas core: {', '.join(missing_core)}",
            )
        )

    for column in REQUIRED_NOT_EMPTY:
        if column in df.columns:
            rows = df.index[df[column].astype(str).str.strip().eq("")].tolist()
            if rows:
                issues.append(
                    build_issue(
                        "empty_fields",
                        "warning",
                        f"Hay campos vacíos en {column}.",
                        [row + 2 for row in rows],
                    )
                )

    for column, label in [("LEGAJO", "legajos"), ("DOCUMENTO", "documentos")]:
        if column in df.columns:
            duplicated = df[
                df[column].astype(str).str.strip().ne("") & df[column].duplicated(keep=False)
            ]
            if not duplicated.empty:
                issues.append(
                    build_issue(
                        "duplicated_values",
                        "error",
                        f"Se detectaron {label} duplicados.",
                        [index + 2 for index in duplicated.index.tolist()],
                    )
                )

    if {"FECHA ALTA", "FECHA BAJA"}.issubset(df.columns):
        alta = pd.to_datetime(df["FECHA ALTA"], errors="coerce")
        baja = pd.to_datetime(df["FECHA BAJA"], errors="coerce")
        invalid_dates = df.index[baja.notna() & alta.notna() & (baja < alta)].tolist()
        if invalid_dates:
            issues.append(
                build_issue(
                    "invalid_dates",
                    "error",
                    "Hay fechas de baja anteriores a la fecha de alta.",
                    [row + 2 for row in invalid_dates],
                )
            )

    if "SALARIO" in df.columns:
        salary = pd.to_numeric(df["SALARIO"], errors="coerce").fillna(0)
        rows = df.index[salary <= 0].tolist()
        if rows:
            issues.append(
                build_issue(
                    "invalid_salary",
                    "warning",
                    "Hay salarios en cero o negativos.",
                    [row + 2 for row in rows],
                )
            )

    return issues
