from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from .workspace_files import resolve_workspace_path

try:
    import openpyxl
except ImportError:
    openpyxl = None


def preview_table(workspace: Path, rel_path: str, max_rows: int = 50) -> dict[str, Any]:
    path = resolve_workspace_path(workspace, rel_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(rel_path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _preview_csv(path, rel_path, max_rows)
    if suffix in {".xlsx", ".xlsm"}:
        return _preview_xlsx(path, rel_path, max_rows)
    raise ValueError("file is not a supported table format")


def _preview_csv(path: Path, rel_path: str, max_rows: int) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        reader = csv.reader(handle)
        rows = [row for _, row in zip(range(max_rows + 1), reader)]
    columns = rows[0] if rows else []
    return {"path": rel_path, "columns": columns, "rows": rows[1:], "sheet": "", "truncated": len(rows) > max_rows}


def _preview_xlsx(path: Path, rel_path: str, max_rows: int) -> dict[str, Any]:
    if openpyxl is None:
        raise ValueError("openpyxl is not installed")
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    rows: list[list[str]] = []
    for index, row in enumerate(sheet.iter_rows(values_only=True)):
        if index > max_rows:
            break
        rows.append([_cell_to_string(value) for value in row])
    columns = rows[0] if rows else []
    return {"path": rel_path, "columns": columns, "rows": rows[1:], "sheet": sheet.title, "truncated": len(rows) > max_rows}


def _cell_to_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value)
