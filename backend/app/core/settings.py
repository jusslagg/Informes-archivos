from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Analisis Nomina API"
    database_url: str = "sqlite:///./storage/nomina.db"
    upload_dir: Path = Path("storage/uploads")
    export_dir: Path = Path("storage/exports")
    latest_dataset: Path = Path("storage/latest_clean.csv")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.export_dir.mkdir(parents=True, exist_ok=True)
