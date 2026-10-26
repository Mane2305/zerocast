"""Measure what a user waits for: cold start, upload, forecast (fresh and cached), accuracy.

    cd backend
    uv run python -m scripts.measure_latency --url https://<workspace>--zerocast-api-api.modal.run
    uv run python -m scripts.measure_latency --url http://127.0.0.1:8000 \
        --file ../data/processed/retail_online.parquet

Uses only the public API, so it works against a local server or the Modal endpoint. Without
--file it uploads a small synthetic daily dataset (5 items, 2 years).
"""

import argparse
import io
import json
import time
import urllib.request
import uuid
from pathlib import Path

import numpy as np
import pandas as pd


def synthetic_csv(items: int = 5, days: int = 730) -> bytes:
    rng = np.random.default_rng(0)
    dates = pd.date_range("2024-01-01", periods=days, freq="D").strftime("%Y-%m-%d")
    t = np.arange(days)
    frames = [
        pd.DataFrame(
            {
                "date": dates,
                "series_id": f"item_{i}",
                "target": 100 + 20 * np.sin(2 * np.pi * t / 7) + rng.normal(0, 5, days),
            }
        )
        for i in range(items)
    ]
    buffer = io.StringIO()
    pd.concat(frames).to_csv(buffer, index=False)
    return buffer.getvalue().encode()


class Client:
    def __init__(self, url: str) -> None:
        self.url = url.rstrip("/")

    def get(self, path: str) -> dict:
        with urllib.request.urlopen(self.url + path, timeout=300) as response:
            return json.load(response)

    def post(self, path: str, body: dict) -> dict:
        request = urllib.request.Request(
            self.url + path, json.dumps(body).encode(), {"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.load(response)

    def upload(self, name: str, data: bytes) -> dict:
        boundary = uuid.uuid4().hex
        body = (
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
                "Content-Type: application/octet-stream\r\n\r\n"
            ).encode()
            + data
            + f"\r\n--{boundary}--\r\n".encode()
        )
        request = urllib.request.Request(
            self.url + "/datasets",
            body,
            {"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.load(response)

    def job(self, kind: str, body: dict) -> tuple[float, str]:
        started = time.perf_counter()
        job = self.post(f"/jobs/{kind}", body)
        while job["status"] not in ("succeeded", "failed"):
            time.sleep(0.2)
            job = self.get(f"/jobs/{job['job_id']}")
        return time.perf_counter() - started, job["status"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--url", required=True)
    parser.add_argument("--file", type=Path, help="CSV/Parquet/JSON to upload")
    args = parser.parse_args()
    api = Client(args.url)

    started = time.perf_counter()
    first = api.get("/health")
    print(f"first response (cold start if idle) {time.perf_counter() - started:7.1f}s")
    while not first.get("model_loaded"):
        time.sleep(1)
        first = api.get("/health")
    print(f"model ready                         {time.perf_counter() - started:7.1f}s")

    data = args.file.read_bytes() if args.file else synthetic_csv()
    name = args.file.name if args.file else "synthetic.csv"
    started = time.perf_counter()
    dataset = api.upload(name, data)
    print(f"upload + data quality               {time.perf_counter() - started:7.1f}s")
    ready = [s["series_id"] for s in dataset["series"] if s["status"] != "excluded"]
    did = dataset["dataset_id"]

    default = {"dataset_id": did, "series_ids": ready[:20], "horizon": 28, "seed": 0}
    for label, kind, body in [
        ("forecast, default (started at upload)", "forecast", {**default, "return_paths": 0}),
        (
            "forecast, 1 item, 30 paths (cached)",
            "forecast",
            {**default, "series_ids": ready[:1], "return_paths": 30},
        ),
        (
            "forecast, 1 item, new horizon 14",
            "forecast",
            {**default, "series_ids": ready[:1], "horizon": 14},
        ),
        (
            "accuracy, up to 5 items",
            "accuracy",
            {"dataset_id": did, "series_ids": ready[:5], "horizon": 14},
        ),
        (
            "accuracy again (reused job)",
            "accuracy",
            {"dataset_id": did, "series_ids": ready[:5], "horizon": 14},
        ),
    ]:
        seconds, status = api.job(kind, body)
        print(f"{label:<36}{seconds:7.1f}s  {status}")


if __name__ == "__main__":
    main()
