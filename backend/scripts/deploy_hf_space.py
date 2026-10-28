"""Deploy the backend to a Hugging Face Docker Space (see README "Deploy: Hugging Face Spaces").

    cd backend
    uv run hf auth login                       # once, with a write token
    uv run python -m scripts.deploy_hf_space   # creates/updates Mane2305/zerocast-api

Uploads only what the image needs (Dockerfile, uv files, app/, migrations/) plus the Space card
from deploy/hf_space/README.md; files on the Space that are no longer part of that set are
deleted. Hugging Face then builds and starts the image. ZC_DB_URL must be set by hand as a
Space secret; this script sets the non-secret ZC_CORS_ORIGINS variable.
"""

import argparse
import json
from pathlib import Path

from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi

BACKEND = Path(__file__).resolve().parent.parent
TOP_LEVEL = ["Dockerfile", "pyproject.toml", "uv.lock", "alembic.ini"]
FOLDERS = ["app", "migrations"]
SPACE_CARD = BACKEND / "deploy" / "hf_space" / "README.md"
KEEP = {".gitattributes"}


def space_files() -> dict[str, Path]:
    """Published path in the Space → local file."""
    files = {name: BACKEND / name for name in TOP_LEVEL}
    for folder in FOLDERS:
        for path in sorted((BACKEND / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                files[path.relative_to(BACKEND).as_posix()] = path
    files["README.md"] = SPACE_CARD
    return files


def space_url(space: str) -> str:
    owner, name = space.split("/")
    return f"https://{owner}-{name}".lower().replace("_", "-").replace(".", "-") + ".hf.space"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--space", default="Mane2305/zerocast-api")
    parser.add_argument(
        "--cors",
        default='["http://localhost:3000"]',
        help="ZC_CORS_ORIGINS: JSON list of allowed frontend origins",
    )
    parser.add_argument("--private", action="store_true", help="needs an HF token per request")
    args = parser.parse_args()
    json.loads(args.cors)  # fail early on a malformed list

    api = HfApi()
    api.create_repo(
        args.space, repo_type="space", space_sdk="docker", private=args.private, exist_ok=True
    )
    api.add_space_variable(args.space, "ZC_CORS_ORIGINS", args.cors)

    files = space_files()
    existing = set(api.list_repo_files(args.space, repo_type="space"))
    operations = [
        CommitOperationAdd(path_in_repo=name, path_or_fileobj=str(path))
        for name, path in files.items()
    ] + [CommitOperationDelete(path_in_repo=name) for name in sorted(existing - set(files) - KEEP)]
    commit = api.create_commit(
        args.space,
        operations,
        commit_message="Deploy ZeroCast backend",
        repo_type="space",
    )
    print(f"uploaded {len(files)} files: {commit.commit_url}")
    print(f"build logs: https://huggingface.co/spaces/{args.space}?logs=build")
    print(f"endpoint:   {space_url(args.space)}  (check {space_url(args.space)}/health)")


if __name__ == "__main__":
    main()
