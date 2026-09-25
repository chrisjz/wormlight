"""Pinned inputs for the reference tools: read data/sources.json and fetch each file into data/cache/,
checked against its SHA-256, exactly as the TypeScript data build does."""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pinned_files(pin_id: str) -> dict[str, Path]:
    """Every file of a pin, by the path after the pin's commit in its URL, downloaded and verified."""
    sources = json.loads((ROOT / "data" / "sources.json").read_text())
    pin = next(p for p in sources["pins"] if p["id"] == pin_id)
    commit = pin["origin"]["commit"]
    files: dict[str, Path] = {}
    for f in pin["files"]:
        cached = CACHE / f["sha256"]
        if not cached.exists() or sha256(cached) != f["sha256"]:
            CACHE.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(f["url"], timeout=60) as response:  # noqa: S310 - pinned https URL
                data = response.read()
            if hashlib.sha256(data).hexdigest() != f["sha256"]:
                raise SystemExit(f"{f['url']} does not match its pinned SHA-256")
            cached.write_bytes(data)
        files[f["url"].split(f"/{commit}/", 1)[1]] = cached
    return files


def digest_of(path: Path) -> str:
    return sha256(path)
