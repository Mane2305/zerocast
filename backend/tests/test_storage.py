import pytest

from app.config import Settings
from app.storage import LocalStorage, make_storage


def test_put_get_roundtrip(tmp_path):
    storage = LocalStorage(tmp_path)

    storage.put("datasets/abc/data.parquet", b"\x00\x01payload")

    assert storage.get("datasets/abc/data.parquet") == b"\x00\x01payload"


def test_put_overwrites(tmp_path):
    storage = LocalStorage(tmp_path)
    storage.put("a.bin", b"old")
    storage.put("a.bin", b"new")

    assert storage.get("a.bin") == b"new"


def test_missing_key_raises_key_error(tmp_path):
    with pytest.raises(KeyError):
        LocalStorage(tmp_path).get("nope.bin")


@pytest.mark.parametrize("key", ["", "../escape", "a/../../b", "/abs", "C:/x", "a\\b"])
def test_rejects_unsafe_keys(tmp_path, key):
    with pytest.raises(ValueError):
        LocalStorage(tmp_path).put(key, b"x")


def test_factory(tmp_path):
    assert isinstance(make_storage(Settings(storage_dir=tmp_path)), LocalStorage)
    with pytest.raises(NotImplementedError):
        make_storage(Settings(storage="supabase", storage_dir=tmp_path))
