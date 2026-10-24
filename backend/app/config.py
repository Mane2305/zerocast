"""Settings read from ZC_* environment variables (see backend/README.md)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ZC_", env_file=".env", extra="ignore")

    env: Literal["local", "prod"] = "local"
    db_url: str = "sqlite:///./storage/zerocast.db"
    storage: Literal["local", "supabase"] = "local"
    storage_dir: Path = Path("./storage/files")
    device: Literal["cpu", "cuda"] = "cpu"
    num_samples: int = Field(default=100, ge=1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
