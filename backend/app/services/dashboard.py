from datetime import date
from typing import Any

import pandas as pd


def _series_counts(df: pd.DataFrame, column: str, limit: int = 12) -> list[dict[str, Any]]:
    if column not in df.columns:
        return []
    counts = df[column].replace("", "Sin dato").value_counts().head(limit)
    return [{"name": str(index), "value": int(value)} for index, value in counts.items()]


def build_dashboard(df: pd.DataFrame) -> dict[str, Any]:
    estado = df.get("ESTADO", pd.Series(dtype=str)).astype(str).str.upper()
    fecha_alta = pd.to_datetime(df.get("FECHA ALTA", pd.Series(dtype=str)), errors="coerce")
    fecha_baja = pd.to_datetime(df.get("FECHA BAJA", pd.Series(dtype=str)), errors="coerce")
    today = date.today()
    altas_mes = fecha_alta[(fecha_alta.dt.month == today.month) & (fecha_alta.dt.year == today.year)]
    bajas_mes = fecha_baja[(fecha_baja.dt.month == today.month) & (fecha_baja.dt.year == today.year)]
    salario = pd.to_numeric(df.get("SALARIO", pd.Series(dtype=float)), errors="coerce").fillna(0)
    carga = pd.to_numeric(df.get("CARGA HORARIA SEMANAL", pd.Series(dtype=float)), errors="coerce").fillna(0)

    return {
        "metrics": {
            "total_empleados": int(len(df)),
            "activos": int(estado.str.contains("ACTIVO", na=False).sum()),
            "bajas": int(estado.str.contains("BAJA|INACTIVO", regex=True, na=False).sum()),
            "bajas_del_mes": int(len(bajas_mes)),
            "altas_del_mes": int(len(altas_mes)),
            "salario_total": float(salario.sum()),
            "salario_promedio": float(salario.mean()) if len(salario) else 0,
            "carga_horaria_total": float(carga.sum()),
        },
        "charts": {
            "empleados_por_area": _series_counts(df, "ÁREA"),
            "empleados_por_cliente": _series_counts(df, "CLIENTE"),
            "empleados_por_campana": _series_counts(df, "CAMPAÑA"),
            "empleados_por_modalidad": _series_counts(df, "MODALIDAD DE CONTRATACIÓN"),
        },
    }
