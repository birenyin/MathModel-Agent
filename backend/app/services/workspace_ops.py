from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def zip_workspace(workspace: Path) -> Path:
    archive_base = workspace.with_name(f"{workspace.name}-export")
    archive_path = Path(shutil.make_archive(str(archive_base), "zip", workspace))
    return archive_path


def compile_latex(workspace: Path, texlive_bin: str | None = None) -> tuple[bool, str, Path | None]:
    tex_path = workspace / "paper" / "main.tex"
    if not tex_path.exists():
        return False, "paper/main.tex not found.", None

    command = ["xelatex", "-interaction=nonstopmode", "-halt-on-error", tex_path.name]
    env_path = None
    if texlive_bin:
        env_path = str(Path(texlive_bin))

    paper_dir = tex_path.parent
    try:
        env = None
        if env_path:
            import os

            env = os.environ.copy()
            env["PATH"] = env_path + os.pathsep + env.get("PATH", "")

        result = subprocess.run(
            command,
            cwd=paper_dir,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return False, "xelatex was not found on PATH.", None
    except subprocess.TimeoutExpired:
        return False, "xelatex timed out after 120 seconds.", None

    log = (result.stdout or "") + "\n" + (result.stderr or "")
    pdf_path = paper_dir / "main.pdf"
    return result.returncode == 0 and pdf_path.exists(), log, pdf_path if pdf_path.exists() else None
