import pytest
from pydantic import ValidationError

from app.config import Settings


def test_defaults(monkeypatch):
    for name in ("ZC_ENV", "ZC_DB_URL", "ZC_STORAGE", "ZC_DEVICE", "ZC_NUM_SAMPLES"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert settings.env == "local"
    assert settings.storage == "local"
    assert settings.device == "cpu"
    assert settings.num_samples == 100
    assert settings.db_url.startswith("sqlite:///")


def test_reads_environment(monkeypatch):
    monkeypatch.setenv("ZC_DEVICE", "cuda")
    monkeypatch.setenv("ZC_NUM_SAMPLES", "20")

    settings = Settings(_env_file=None)

    assert settings.device == "cuda"
    assert settings.num_samples == 20


def test_rejects_invalid_values(monkeypatch):
    monkeypatch.setenv("ZC_DEVICE", "tpu")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
