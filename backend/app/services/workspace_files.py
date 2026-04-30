from __future__ import annotations

from pathlib import Path
from typing import Any

TEXT_SUFFIXES = {
    ".csv",
    ".json",
    ".log",
    ".m",
    ".md",
    ".py",
    ".r",
    ".tex",
    ".txt",
    ".yaml",
    ".yml",
}

MAX_TEXT_BYTES = 2_000_000


def list_workspace_files(workspace: Path, max_files: int = 500) -> list[dict[str, Any]]:
    root = workspace.resolve()
    if not root.exists():
        return []

    items: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if len(items) >= max_files:
            break
        if not path.is_file():
            continue
        rel_path = path.relative_to(root).as_posix()
        stat = path.stat()
        items.append(
            {
                "path": rel_path,
                "name": path.name,
                "size": stat.st_size,
                "suffix": path.suffix.lower(),
                "text_previewable": is_text_previewable(path),
            }
        )
    return items


def read_workspace_text(workspace: Path, rel_path: str) -> str:
    path = resolve_workspace_path(workspace, rel_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(rel_path)
    if not is_text_previewable(path):
        raise ValueError("file is not editable text")
    if path.stat().st_size > MAX_TEXT_BYTES:
        raise ValueError("file is too large to edit in the app")
    return path.read_text(encoding="utf-8", errors="replace")


def write_workspace_text(workspace: Path, rel_path: str, content: str) -> Path:
    path = resolve_workspace_path(workspace, rel_path)
    if path.suffix.lower() not in TEXT_SUFFIXES:
        raise ValueError("only text-like files can be edited")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", errors="replace")
    return path


def resolve_workspace_path(workspace: Path, rel_path: str) -> Path:
    if not rel_path or Path(rel_path).is_absolute():
        raise ValueError("path must be relative to the workspace")
    root = workspace.resolve()
    candidate = (root / rel_path).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError("path escapes workspace")
    return candidate


def is_text_previewable(path: Path) -> bool:
    return path.suffix.lower() in TEXT_SUFFIXES
