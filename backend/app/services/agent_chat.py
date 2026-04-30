from __future__ import annotations

from typing import Any

from .llm import LLMClient

MAX_CONTEXT_CHARS = 28_000


async def answer_agent_chat(
    settings: dict[str, str],
    workflow: dict[str, Any],
    files: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
    uploads: list[dict[str, Any]],
    events: list[dict[str, Any]],
    message: str,
    active_file_path: str = "",
    active_file_content: str = "",
) -> dict[str, Any]:
    configured = bool(settings.get("model_base_url") and settings.get("model_name") and settings.get("model_api_key"))
    prompt = build_agent_prompt(workflow, files, artifacts, uploads, events, message, active_file_path, active_file_content)

    if not configured:
        return {
            "role": "assistant",
            "mode": "fallback",
            "message": local_agent_reply(workflow, files, artifacts, message, active_file_path),
            "suggested_actions": suggested_actions(active_file_path, files),
        }

    text = await LLMClient(settings).complete(
        (
            "You are MathModel-Agent inside a desktop mathematical modeling workbench. "
            "Be concrete, workflow-aware, and concise. Prefer actionable steps. "
            "When useful, mention files by relative workspace path."
        ),
        prompt,
    )
    return {
        "role": "assistant",
        "mode": "provider",
        "message": text,
        "suggested_actions": suggested_actions(active_file_path, files),
    }


def build_agent_prompt(
    workflow: dict[str, Any],
    files: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
    uploads: list[dict[str, Any]],
    events: list[dict[str, Any]],
    message: str,
    active_file_path: str,
    active_file_content: str,
) -> str:
    steps = "\n".join(
        f"- {step['id']}: {step['title']} [{step['status']}]{' checkpoint' if step.get('checkpoint') else ''}"
        for step in workflow.get("steps", [])
    )
    file_lines = "\n".join(f"- {item['path']} ({item['size']} bytes)" for item in files[:80])
    artifact_lines = "\n".join(f"- {item['title']} | {item['kind']} | {item['path']}" for item in artifacts[-40:])
    upload_lines = "\n".join(f"- {item['filename']} ({item.get('extracted_chars', 0)} chars)" for item in uploads[-20:])
    event_lines = "\n".join(f"- {item['level']}: {item['message']}" for item in events[-20:])
    active = active_file_content[:10_000] if active_file_content else "(not provided)"

    prompt = f"""
Workflow:
- title: {workflow['title']}
- kind: {workflow['kind']}
- preset: {workflow['preset']}
- status: {workflow['status']}
- current_step: {workflow.get('current_step') or '(none)'}
- workspace: {workflow['workspace']}

Steps:
{steps or '(none)'}

Workspace files:
{file_lines or '(none)'}

Artifacts:
{artifact_lines or '(none)'}

Uploads:
{upload_lines or '(none)'}

Recent events:
{event_lines or '(none)'}

Active file:
{active_file_path or '(none)'}

Active file content excerpt:
{active}

User message:
{message}

Answer in Chinese unless the user explicitly asks otherwise. If the request implies an operation,
explain the exact button/action the user can take in this app.
""".strip()
    return prompt[:MAX_CONTEXT_CHARS]


def local_agent_reply(workflow: dict[str, Any], files: list[dict[str, Any]], artifacts: list[dict[str, Any]], message: str, active_file_path: str) -> str:
    pending = [step for step in workflow.get("steps", []) if step.get("status") in {"pending", "waiting", "running"}]
    next_step = pending[0] if pending else None
    lower = message.lower()
    lines = [
        "当前还没有配置模型，所以我先用本地规则给你一个工作台建议。",
        "",
        f"当前 workflow 是 `{workflow['title']}`，状态是 `{workflow['status']}`。",
    ]
    if next_step:
        lines.append(f"下一步最该处理的是 `{next_step['title']}`，状态 `{next_step['status']}`。")
    if active_file_path:
        lines.append(f"当前打开文件是 `{active_file_path}`。")

    if active_file_path.endswith(".py") or "代码" in message or "run" in lower or "运行" in message:
        lines.extend(
            [
                "",
                "建议先点击 `Run Python` 运行当前脚本，看右侧 stdout/stderr。",
                "如果运行失败，把错误日志发给 Agent，我会按报错定位到代码和数据路径问题。",
            ]
        )
    elif active_file_path.endswith(".tex") or "latex" in lower or "论文" in message or "pdf" in lower:
        lines.extend(
            [
                "",
                "建议点击 `Compile PDF`，让源码和 PDF 预览联动起来。",
                "如果编译失败，先看下方 compile log，重点查缺包、图片路径、中文字体和特殊字符。",
            ]
        )
    elif "下一步" in message or "继续" in message or "怎么办" in message:
        lines.extend(
            [
                "",
                "建议顺序是：资料抽取 -> 问题分析 -> 建模方案 -> 代码运行 -> 图表检查 -> LaTeX 编译 -> Reviewer 审稿。",
                "现在可以先跑 workflow，或者打开最新的 `paper/main.tex` / `code/main.py` 继续编辑。",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "你可以问我：下一步做什么、解释运行报错、怎么改论文结构、怎么生成图表、怎么审稿。",
            ]
        )

    if files:
        important = [item["path"] for item in files if item["path"].endswith(("main.py", "main.tex", ".pdf", ".log"))][:5]
        if important:
            lines.extend(["", "我看到几个关键文件：", *[f"- `{path}`" for path in important]])
    if artifacts:
        lines.extend(["", f"目前已有 {len(artifacts)} 个 artifact，可以从 Artifacts 面板打开查看。"])
    return "\n".join(lines)


def suggested_actions(active_file_path: str, files: list[dict[str, Any]]) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    if active_file_path.endswith(".py"):
        actions.append({"id": "run_python", "label": "Run Python", "description": "运行当前 Python 文件"})
    if active_file_path.endswith(".tex"):
        actions.append({"id": "compile_latex", "label": "Compile PDF", "description": "编译当前工作区论文"})
    if any(item["path"].endswith(".pdf") for item in files):
        actions.append({"id": "open_pdf", "label": "Open Latest PDF", "description": "查看工作区 PDF"})
    actions.append({"id": "review_next", "label": "Next Step", "description": "让 Agent 给出下一步建议"})
    return actions[:4]
