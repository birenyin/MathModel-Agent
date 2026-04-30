from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import DB_PATH, ensure_runtime_dirs


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    ensure_runtime_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            create table if not exists workflows (
              id text primary key,
              kind text not null,
              preset text not null,
              title text not null,
              status text not null,
              workspace text not null,
              current_step text,
              problem_text text not null,
              requirements text not null,
              language text not null,
              coding_tool text not null,
              page_limit integer,
              steps_json text not null,
              created_at text not null,
              updated_at text not null
            );

            create table if not exists artifacts (
              id text primary key,
              workflow_id text not null,
              step_id text not null,
              title text not null,
              path text not null,
              kind text not null,
              created_at text not null
            );

            create table if not exists uploads (
              id text primary key,
              workflow_id text not null,
              filename text not null,
              path text not null,
              content_type text not null,
              extracted_text text not null,
              extracted_chars integer not null,
              created_at text not null
            );

            create table if not exists events (
              id text primary key,
              workflow_id text not null,
              level text not null,
              message text not null,
              created_at text not null
            );

            create table if not exists settings (
              key text primary key,
              value text not null
            );
            """
        )


def row_to_workflow(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    item["steps"] = json.loads(item.pop("steps_json"))
    return item


def create_workflow(payload: dict[str, Any], steps: list[dict[str, Any]], workspace: Path) -> dict[str, Any]:
    workflow_id = str(uuid.uuid4())
    now = utc_now()
    workspace.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.execute(
            """
            insert into workflows (
              id, kind, preset, title, status, workspace, current_step,
              problem_text, requirements, language, coding_tool, page_limit,
              steps_json, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                workflow_id,
                payload["kind"],
                payload["preset"],
                payload["title"],
                "draft",
                str(workspace),
                None,
                payload.get("problem_text", ""),
                payload.get("requirements", ""),
                payload.get("language", "zh"),
                payload.get("coding_tool", "python"),
                payload.get("page_limit"),
                json.dumps(steps, ensure_ascii=False),
                now,
                now,
            ),
        )
    return get_workflow(workflow_id)


def list_workflows() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("select * from workflows order by updated_at desc").fetchall()
    return [row_to_workflow(row) for row in rows]


def get_workflow(workflow_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("select * from workflows where id = ?", (workflow_id,)).fetchone()
    if row is None:
        raise KeyError(workflow_id)
    return row_to_workflow(row)


def save_workflow(workflow: dict[str, Any]) -> None:
    now = utc_now()
    with connect() as conn:
        conn.execute(
            """
            update workflows
            set status = ?, current_step = ?, steps_json = ?, updated_at = ?
            where id = ?
            """,
            (
                workflow["status"],
                workflow.get("current_step"),
                json.dumps(workflow["steps"], ensure_ascii=False),
                now,
                workflow["id"],
            ),
        )


def append_workflow_problem_text(workflow_id: str, text: str) -> None:
    workflow = get_workflow(workflow_id)
    header = "\n\n--- Uploaded material ---\n"
    merged = (workflow["problem_text"] or "") + header + text
    now = utc_now()
    with connect() as conn:
        conn.execute(
            "update workflows set problem_text = ?, updated_at = ? where id = ?",
            (merged[:500_000], now, workflow_id),
        )


def add_event(workflow_id: str, message: str, level: str = "info") -> None:
    with connect() as conn:
        conn.execute(
            "insert into events (id, workflow_id, level, message, created_at) values (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), workflow_id, level, message, utc_now()),
        )


def list_events(workflow_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "select * from events where workflow_id = ? order by created_at asc",
            (workflow_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_artifact(workflow_id: str, step_id: str, title: str, path: Path, kind: str) -> dict[str, Any]:
    artifact_id = str(uuid.uuid4())
    item = {
        "id": artifact_id,
        "workflow_id": workflow_id,
        "step_id": step_id,
        "title": title,
        "path": str(path),
        "kind": kind,
        "created_at": utc_now(),
    }
    with connect() as conn:
        conn.execute(
            """
            insert into artifacts (id, workflow_id, step_id, title, path, kind, created_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """,
            tuple(item.values()),
        )
    return item


def list_artifacts(workflow_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "select * from artifacts where workflow_id = ? order by created_at asc",
            (workflow_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_artifact(artifact_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("select * from artifacts where id = ?", (artifact_id,)).fetchone()
    if row is None:
        raise KeyError(artifact_id)
    return dict(row)


def add_upload(
    workflow_id: str,
    filename: str,
    path: Path,
    content_type: str,
    extracted_text: str,
) -> dict[str, Any]:
    upload_id = str(uuid.uuid4())
    item = {
        "id": upload_id,
        "workflow_id": workflow_id,
        "filename": filename,
        "path": str(path),
        "content_type": content_type,
        "extracted_text": extracted_text,
        "extracted_chars": len(extracted_text),
        "created_at": utc_now(),
    }
    with connect() as conn:
        conn.execute(
            """
            insert into uploads (
              id, workflow_id, filename, path, content_type,
              extracted_text, extracted_chars, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            tuple(item.values()),
        )
    return item


def list_uploads(workflow_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            select id, workflow_id, filename, path, content_type, extracted_chars, created_at
            from uploads where workflow_id = ? order by created_at asc
            """,
            (workflow_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_upload(upload_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("select * from uploads where id = ?", (upload_id,)).fetchone()
    if row is None:
        raise KeyError(upload_id)
    return dict(row)


def get_settings() -> dict[str, str]:
    with connect() as conn:
        rows = conn.execute("select key, value from settings").fetchall()
    return {row["key"]: row["value"] for row in rows}


def set_settings(payload: dict[str, str]) -> dict[str, str]:
    with connect() as conn:
        for key, value in payload.items():
            if key.endswith("_api_key") and not value:
                continue
            conn.execute(
                "insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
                (key, value or ""),
            )
    return get_settings()
