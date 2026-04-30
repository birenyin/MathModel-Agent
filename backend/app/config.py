from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = Path(os.getenv("MMA_DATA_DIR", PROJECT_DIR / ".data"))
WORKSPACES_DIR = Path(os.getenv("MMA_WORKSPACES_DIR", DATA_DIR / "workspaces"))
DB_PATH = Path(os.getenv("MMA_DB_PATH", DATA_DIR / "app.db"))

APP_NAME = "MathModel-Agent"
APP_VERSION = "0.1.0"


def ensure_runtime_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)

