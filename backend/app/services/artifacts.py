from __future__ import annotations

from pathlib import Path


def write_text_artifact(workspace: Path, relative_path: str, content: str) -> Path:
    path = workspace / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def safe_workspace_name(title: str) -> str:
    allowed = []
    for ch in title.strip():
        if ch.isalnum() or ch in "-_":
            allowed.append(ch)
        elif ch.isspace():
            allowed.append("-")
    name = "".join(allowed).strip("-")
    return name[:80] or "workflow"

