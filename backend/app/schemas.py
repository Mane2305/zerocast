"""Pydantic response models mirroring contracts/openapi.yaml."""

from typing import Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    model_loaded: bool
    device: str | None = None
    version: str | None = None
