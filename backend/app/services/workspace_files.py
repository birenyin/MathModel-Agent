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

EMBED_SUFFIXES = {
    ".gif",
    ".jpg",
    ".jpeg",
    ".pdf",
    ".png",
    ".svg",
    ".webp",
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
        suffix = path.suffix.lower()
        items.append(
            {
                "path": rel_path,
                "name": path.name,
                "size": stat.st_size,
                "suffix": suffix,
                "directory": path.parent.relative_to(root).as_posix() if path.parent != root else "",
                "category": categorize_workspace_file(rel_path, suffix),
                "modified_at": stat.st_mtime,
                "text_previewable": is_text_previewable(path),
                "embeddable": is_embeddable(path),
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


def is_embeddable(path: Path) -> bool:
    return path.suffix.lower() in EMBED_SUFFIXES


def categorize_workspace_file(rel_path: str, suffix: str) -> str:
    path = rel_path.replace("\\", "/").lower()
    if path.startswith("paper/") or suffix == ".tex":
        return "paper"
    if path.startswith("code/") or suffix in {".py", ".m", ".r"}:
        return "code"
    if path.startswith("figures/") or suffix in {".png", ".jpg", ".jpeg", ".svg", ".webp"}:
        return "figures"
    if path.startswith("tables/") or suffix in {".csv", ".xlsx", ".xlsm"}:
        return "tables"
    if path.startswith("input/"):
        return "input"
    if path.startswith("runs/") or suffix == ".log":
        return "logs"
    if suffix == ".pdf":
        return "pdf"
    if path.startswith("reports/") or suffix in {".md", ".txt"}:
        return "reports"
    return "other"
