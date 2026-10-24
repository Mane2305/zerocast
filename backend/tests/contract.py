"""Helpers for checking responses against contracts/openapi.yaml."""

from functools import cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "openapi.yaml"


@cache
def _spec() -> dict[str, Any]:
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


def assert_matches_schema(schema_name: str, payload: Any) -> None:
    """Validate payload against a component schema and reject fields the contract doesn't define."""
    spec = _spec()
    schema = spec["components"]["schemas"][schema_name]
    validator = Draft202012Validator(
        {"$ref": f"#/components/schemas/{schema_name}", "components": spec["components"]}
    )
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)
    if isinstance(payload, dict) and "properties" in schema:
        extra = set(payload) - set(schema["properties"])
        assert not extra, f"Fields not in contract {schema_name}: {sorted(extra)}"
