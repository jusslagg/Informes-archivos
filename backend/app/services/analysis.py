from typing import Any

import pandas as pd

from app.schemas.analysis import DynamicAnalysisRequest


def run_dynamic_analysis(df: pd.DataFrame, payload: DynamicAnalysisRequest) -> list[dict[str, Any]]:
    working = df.copy()
    for column in ["SALARIO", "CARGA HORARIA SEMANAL"]:
        if column in working.columns:
            working[column] = pd.to_numeric(working[column], errors="coerce").fillna(0)

    for filter_spec in payload.filters:
        if filter_spec.column in working.columns and filter_spec.values:
            series = working[filter_spec.column].astype(str).replace("", "Sin dato")
            working = working[series.isin(filter_spec.values)]

    dimensions = [column for column in payload.dimensions if column in working.columns]
    if not dimensions:
        dimensions = ["ÁREA"] if "ÁREA" in working.columns else [working.columns[0]]

    metric = payload.metric
    if metric == "salary_sum" and "SALARIO" in working.columns:
        result = working.groupby(dimensions, dropna=False)["SALARIO"].sum().reset_index(name="value")
    elif metric == "salary_avg" and "SALARIO" in working.columns:
        result = working.groupby(dimensions, dropna=False)["SALARIO"].mean().reset_index(name="value")
    elif metric == "hours_sum" and "CARGA HORARIA SEMANAL" in working.columns:
        result = working.groupby(dimensions, dropna=False)["CARGA HORARIA SEMANAL"].sum().reset_index(name="value")
    else:
        result = working.groupby(dimensions, dropna=False).size().reset_index(name="value")

    return result.sort_values("value", ascending=False).head(50).fillna("Sin dato").to_dict(orient="records")
