from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from .workspace_files import resolve_workspace_path

MAX_OUTPUT_CHARS = 80_000


@dataclass(frozen=True)
class RunResult:
    ok: bool
    exit_code: int | None
    timed_out: bool
    elapsed_seconds: float
    stdout: str
    stderr: str
    command: list[str]


async def run_python_file(workspace: Path, rel_path: str, timeout_seconds: int = 30) -> RunResult:
    script_path = resolve_workspace_path(workspace, rel_path)
    if not script_path.exists() or not script_path.is_file():
        raise FileNotFoundError(rel_path)
    if script_path.suffix.lower() != ".py":
        raise ValueError("only Python files can be run")

    command = [sys.executable, "-B", str(script_path)]
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    return await asyncio.to_thread(_run_sync, workspace, command, env, timeout_seconds)


def _run_sync(workspace: Path, command: list[str], env: dict[str, str], timeout_seconds: int) -> RunResult:
    started = time.perf_counter()
    timed_out = False
    try:
        completed = subprocess.run(
            command,
            cwd=str(workspace),
            env=env,
            text=False,
            capture_output=True,
            timeout=timeout_seconds,
        )
        exit_code = completed.returncode
        stdout_bytes = completed.stdout
        stderr_bytes = completed.stderr
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        exit_code = None
        stdout_bytes = exc.stdout or b""
        stderr_bytes = exc.stderr or b""

    elapsed = time.perf_counter() - started
    stdout = _decode(stdout_bytes)
    stderr = _decode(stderr_bytes)
    if timed_out:
        stderr = (stderr + f"\nProcess timed out after {timeout_seconds} seconds.").strip()

    return RunResult(
        ok=(not timed_out and exit_code == 0),
        exit_code=exit_code,
        timed_out=timed_out,
        elapsed_seconds=elapsed,
        stdout=stdout[-MAX_OUTPUT_CHARS:],
        stderr=stderr[-MAX_OUTPUT_CHARS:],
        command=command,
    )


def render_run_log(rel_path: str, result: RunResult) -> str:
    status = "ok" if result.ok else "failed"
    return "\n".join(
        [
            f"Run target: {rel_path}",
            f"Status: {status}",
            f"Exit code: {result.exit_code}",
            f"Timed out: {result.timed_out}",
            f"Elapsed seconds: {result.elapsed_seconds:.2f}",
            f"Command: {' '.join(result.command)}",
            "",
            "STDOUT",
            "------",
            result.stdout or "(empty)",
            "",
            "STDERR",
            "------",
            result.stderr or "(empty)",
            "",
        ]
    )


def _decode(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")
