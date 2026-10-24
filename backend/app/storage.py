"""File storage interface. Phase 1: local folder. Phase 2: Supabase Storage."""

from pathlib import Path, PurePosixPath
from typing import Protocol

from app.config import Settings


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes:
        """Return the stored bytes. Raises KeyError if the key does not exist."""
        ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        parts = PurePosixPath(key).parts
        if not key or key.startswith("/") or "\\" in key or ".." in parts or ":" in key:
            raise ValueError(f"Invalid storage key: {key!r}")
        return self.root.joinpath(*parts)

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)

    def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise KeyError(key)
        return path.read_bytes()


def make_storage(settings: Settings) -> Storage:
    if settings.storage == "local":
        return LocalStorage(settings.storage_dir)
    raise NotImplementedError("Supabase storage is a Phase 2 adapter")
