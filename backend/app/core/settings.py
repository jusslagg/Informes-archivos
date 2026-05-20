import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


IS_VERCEL = os.getenv("VERCEL") == "1"
BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_STORAGE_DIR = Path("/tmp/analisis-nomina") if IS_VERCEL else BACKEND_DIR / "storage"


class Settings(BaseSettings):
    app_name: str = "Analisis Nomina API"
    database_url: str = f"sqlite:///{(DEFAULT_STORAGE_DIR / 'nomina.db').as_posix()}"
    upload_dir: Path = DEFAULT_STORAGE_DIR / "uploads"
    export_dir: Path = DEFAULT_STORAGE_DIR / "exports"
    latest_dataset: Path = DEFAULT_STORAGE_DIR / "latest_clean.csv"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cors_origin_regex: str = r"https://.*\.vercel\.app|https://.*\.github\.io"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
Path(settings.latest_dataset).parent.mkdir(parents=True, exist_ok=True)
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.export_dir.mkdir(parents=True, exist_ok=True)
