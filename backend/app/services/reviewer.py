from __future__ import annotations

from pathlib import Path
from typing import Any

from .llm import LLMClient
from .workspace_files import read_workspace_text

MAX_REVIEW_CONTEXT = 36_000


async def review_workflow(
    workflow: dict[str, Any],
    files: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
    uploads: list[dict[str, Any]],
    settings: dict[str, str],
) -> dict[str, str]:
    paper_text = _collect_paper_text(Path(workflow["workspace"]))
    reviewer_settings, mode = _reviewer_settings(settings)
    configured = bool(
        reviewer_settings.get("model_base_url")
        and reviewer_settings.get("model_name")
        and reviewer_settings.get("model_api_key")
    )
    if not configured:
        return {"mode": "fallback", "report": _fallback_review(workflow, files, artifacts, paper_text)}

    report = await LLMClient(reviewer_settings).complete(
        (
            "You are a strict mathematical modeling contest reviewer. "
            "Find risks before praising. Return severity-tagged findings first, then fixes."
        ),
        _review_prompt(workflow, files, artifacts, uploads, paper_text),
    )
    return {"mode": mode, "report": report}


def _reviewer_settings(settings: dict[str, str]) -> tuple[dict[str, str], str]:
    if settings.get("reviewer_base_url") and settings.get("reviewer_model_name") and settings.get("reviewer_api_key"):
        return (
            {
                "model_base_url": settings.get("reviewer_base_url", ""),
                "model_name": settings.get("reviewer_model_name", ""),
                "model_api_key": settings.get("reviewer_api_key", ""),
            },
            "reviewer",
        )
    return settings, "provider"


def _review_prompt(
    workflow: dict[str, Any],
    files: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
    uploads: list[dict[str, Any]],
    paper_text: str,
) -> str:
    file_lines = "\n".join(f"- {item['path']} ({item['category']}, {item['size']} bytes)" for item in files[:120])
    artifact_lines = "\n".join(f"- {item['title']} | {item['kind']} | {item['path']}" for item in artifacts[-60:])
    upload_lines = "\n".join(f"- {item['filename']} ({item.get('extracted_chars', 0)} chars)" for item in uploads[-30:])
    steps = "\n".join(f"- {step['title']}: {step['status']}" for step in workflow.get("steps", []))
    prompt = f"""
Workflow:
- title: {workflow['title']}
- kind: {workflow['kind']}
- preset: {workflow['preset']}
- status: {workflow['status']}

Steps:
{steps or '(none)'}

Files:
{file_lines or '(none)'}

Artifacts:
{artifact_lines or '(none)'}

Uploads:
{upload_lines or '(none)'}

Paper/main text:
{paper_text[:24_000] or '(no paper text found)'}

Review dimensions:
- problem interpretation
- assumptions and symbol table
- model validity and novelty
- data/code reproducibility
- figure/table evidence
- sensitivity/robustness
- paper structure and judge readability
- concrete fixes before submission

Return Chinese review notes. Put severity-tagged findings first.
""".strip()
    return prompt[:MAX_REVIEW_CONTEXT]


def _collect_paper_text(workspace: Path) -> str:
    candidates = ["paper/main.tex", "paper/paper_draft.md", "reports/paper_draft.md"]
    chunks: list[str] = []
    for rel_path in candidates:
        try:
            chunks.append(f"# {rel_path}\n\n{read_workspace_text(workspace, rel_path)}")
        except (FileNotFoundError, ValueError):
            continue
    return "\n\n".join(chunks)


def _fallback_review(workflow: dict[str, Any], files: list[dict[str, Any]], artifacts: list[dict[str, Any]], paper_text: str) -> str:
    has_tex = any(item["path"].endswith(".tex") for item in files)
    has_code = any(item["path"].endswith(".py") for item in files)
    has_figures = any(item["category"] == "figures" for item in files)
    has_tables = any(item["category"] == "tables" for item in files)
    lines = [
        f"# Review Report: {workflow['title']}",
        "",
        "Mode: local fallback reviewer",
        "",
        "## Findings",
        "",
    ]
    if not paper_text:
        lines.append("- [High] No paper draft was found under `paper/main.tex` or reports.")
    if not has_code:
        lines.append("- [High] No Python modeling code was found. Add reproducible code under `code/` and run it.")
    if not has_figures:
        lines.append("- [Medium] No figure outputs were found. Save claim-supporting charts under `figures/`.")
    if not has_tables:
        lines.append("- [Medium] No result tables were found. Save key numeric results under `tables/`.")
    if not has_tex:
        lines.append("- [Medium] No LaTeX source was found. Create `paper/main.tex` and compile a PDF.")
    if artifacts:
        lines.append(f"- [Info] {len(artifacts)} artifacts exist. Verify every paper claim links to code/table/figure artifacts.")
    lines.extend(
        [
            "",
            "## Fix Checklist",
            "",
            "- Restate the problem and define all decision variables.",
            "- Add assumptions with justification and risk.",
            "- Ensure every formula has symbol definitions.",
            "- Run code from the workspace root and attach stdout/stderr logs.",
            "- Add sensitivity analysis and robustness checks.",
            "- Compile the PDF and inspect figures, captions, references, and page layout.",
            "- Ask Agent to explain compile or run errors before submission.",
            "",
        ]
    )
    return "\n".join(lines)
