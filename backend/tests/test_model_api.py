from tests.contract import assert_matches_schema


def test_model_info_matches_contract(model_client):
    response = model_client.get("/model/info")

    assert response.status_code == 200
    body = response.json()
    assert_matches_schema("ModelInfo", body)
    assert body["quantile_levels"] == [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    assert body["max_context"] == 2048
    assert body["block_size"] == 64
    assert body["license"] == "CC-BY-NC-4.0 (weights)"
    assert body["parameters"] > 0
    assert len(body["revision"]) == 40  # the pinned yug commit
    assert body.get("weights_revision") is None  # ZC_MODEL_REVISION not set in tests


def test_health_ok_when_model_loaded(model_client):
    body = model_client.get("/health").json()

    assert body["status"] == "ok" and body["model_loaded"] is True
    assert_matches_schema("Health", body)


def test_model_info_503_when_disabled(client):
    response = client.get("/model/info")

    assert response.status_code == 503
    assert_matches_schema("Error", response.json())
    assert response.json()["code"] == "model_disabled"
