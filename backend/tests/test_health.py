from app import __version__
from tests.contract import assert_matches_schema


def test_health_degraded_without_model(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "status": "degraded",
        "model_loaded": False,
        "device": "cpu",
        "version": __version__,
    }


def test_health_matches_contract(client):
    assert_matches_schema("Health", client.get("/health").json())


def test_contract_check_rejects_unknown_fields():
    try:
        assert_matches_schema("Health", {"status": "ok", "model_loaded": False, "extra": 1})
    except AssertionError as exc:
        assert "extra" in str(exc)
    else:
        raise AssertionError("unknown field was accepted")


def test_cors_allows_the_frontend_dev_server(client):
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    other = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in other.headers
