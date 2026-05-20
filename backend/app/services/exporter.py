from pathlib import Path

import pandas as pd

from app.core.settings import settings


def export_workbook(df: pd.DataFrame, dashboard: dict, validations: list[dict]) -> Path:
    path = settings.export_dir / "analisis_nomina.xlsx"
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Nomina limpia", index=False)
        pd.DataFrame([dashboard["metrics"]]).to_excel(writer, sheet_name="Metricas", index=False)

        chart_rows = []
        for chart_name, rows in dashboard["charts"].items():
            for row in rows:
                chart_rows.append({"grafico": chart_name, **row})
        pd.DataFrame(chart_rows).to_excel(writer, sheet_name="Distribuciones", index=False)
        pd.DataFrame(validations).to_excel(writer, sheet_name="Validaciones", index=False)

    return path
