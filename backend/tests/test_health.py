from fastapi.testclient import TestClient

from app import __version__
from app.main import create_app
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


VERCEL_ORIGINS = "https://zerocast(-[a-z0-9-]+)?[.]vercel[.]app"  # as in modal_app.py


def test_cors_origin_regex_allows_vercel_deployments(settings):
    settings = settings.model_copy(update={"cors_origin_regex": VERCEL_ORIGINS})
    with TestClient(create_app(settings)) as client:
        for origin in [
            "https://zerocast.vercel.app",
            "https://zerocast-git-main-mane2305s-projects.vercel.app",
        ]:
            response = client.get("/health", headers={"Origin": origin})
            assert response.headers["access-control-allow-origin"] == origin
        for origin in ["https://other.vercel.app", "https://zerocast.vercel.app.evil.example"]:
            response = client.get("/health", headers={"Origin": origin})
            assert "access-control-allow-origin" not in response.headers
