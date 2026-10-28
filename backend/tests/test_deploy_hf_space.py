from scripts.deploy_hf_space import SPACE_CARD, space_files, space_url


def test_space_gets_what_the_image_needs():
    files = space_files()
    for name in ["Dockerfile", "uv.lock", "alembic.ini", "app/main.py", "migrations/env.py"]:
        assert files[name].is_file()
    assert any(name.startswith("migrations/versions/") for name in files)
    assert files["README.md"] == SPACE_CARD
    assert not any("__pycache__" in name or name.startswith("tests/") for name in files)


def test_space_card_declares_a_docker_space_on_the_dockerfile_port():
    card = SPACE_CARD.read_text(encoding="utf-8")
    assert "sdk: docker" in card and "app_port: 7860" in card
    assert '--port", "7860"' in space_files()["Dockerfile"].read_text(encoding="utf-8")


def test_space_url():
    assert space_url("Mane2305/zerocast-api") == "https://mane2305-zerocast-api.hf.space"
