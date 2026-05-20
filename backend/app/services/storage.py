from pathlib import Path

import pandas as pd

from app.core.settings import settings


def save_latest_dataset(df: pd.DataFrame) -> None:
    df.to_csv(settings.latest_dataset, index=False, encoding="utf-8-sig")


def load_latest_dataset() -> pd.DataFrame:
    if not Path(settings.latest_dataset).exists():
        raise FileNotFoundError("Todavía no se importó ninguna nómina.")
    return pd.read_csv(settings.latest_dataset, dtype=str).fillna("")
