from app import __version__
from tests.contract import assert_matches_schema


def test_health_returns_ok(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "model_loaded": False, "device": "cpu", "version": __version__}


def test_health_matches_contract(client):
    assert_matches_schema("Health", client.get("/health").json())


def test_contract_check_rejects_unknown_fields():
    try:
        assert_matches_schema("Health", {"status": "ok", "model_loaded": False, "extra": 1})
    except AssertionError as exc:
        assert "extra" in str(exc)
    else:
        raise AssertionError("unknown field was accepted")
