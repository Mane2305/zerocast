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
    load_model: bool = True
    model_id: str = "birlaailabs/yug"
    model_revision: str | None = None
    # CPU threads for the model. Too many threads is slower (497 ms vs 58 ms per forecast
    # with 16 vs 8 threads); unset = half the CPUs, at most 8. Set it explicitly in containers,
    # where the CPU count is the host's.
    torch_threads: int | None = Field(default=None, ge=1)
    # Run one dummy forecast right after loading so the first real request is not slower.
    warmup: bool = True
    # After an upload, forecast the first `prewarm_max_items` usable items at
    # `prewarm_horizon` in the background so the Forecast page finds results ready.
    prewarm: bool = True
    prewarm_horizon: int = Field(default=28, ge=1, le=256)
    prewarm_max_items: int = Field(default=20, ge=1, le=100)
    # Browser origins allowed to call the API (the Next.js dev server by default).
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    # Also allowed: origins matching this regex (e.g. every Vercel deployment of the project).
    cors_origin_regex: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
