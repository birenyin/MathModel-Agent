from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from .. import db
from .artifacts import write_text_artifact
from .llm import LLMClient


class WorkflowEngine:
    def __init__(self) -> None:
        self.tasks: dict[str, asyncio.Task] = {}

    def start(self, workflow_id: str) -> None:
        if workflow_id in self.tasks and not self.tasks[workflow_id].done():
            return
        self.tasks[workflow_id] = asyncio.create_task(self._run(workflow_id))

    async def approve_and_resume(self, workflow_id: str, note: str = "") -> None:
        workflow = db.get_workflow(workflow_id)
        if workflow["status"] != "waiting":
            return
        for step in workflow["steps"]:
            if step["status"] == "waiting":
                step["status"] = "completed"
                break
        workflow["status"] = "running"
        db.save_workflow(workflow)
        db.add_event(workflow_id, f"Checkpoint approved. {note}".strip())
        self.start(workflow_id)

    async def _run(self, workflow_id: str) -> None:
        workflow = db.get_workflow(workflow_id)
        workflow["status"] = "running"
        db.save_workflow(workflow)
        db.add_event(workflow_id, "Workflow started.")

        try:
            settings = db.get_settings()
            llm = LLMClient(settings)
            for step in workflow["steps"]:
                if step["status"] in {"completed", "waiting"}:
                    if step["status"] == "waiting":
                        workflow["status"] = "waiting"
                        db.save_workflow(workflow)
                        return
                    continue

                workflow["current_step"] = step["id"]
                step["status"] = "running"
                db.save_workflow(workflow)
                db.add_event(workflow_id, f"Running step: {step['title']}")

                artifact = await self._run_step(workflow, step, llm)
                step["artifact_path"] = artifact["path"]

                if step.get("checkpoint"):
                    step["status"] = "waiting"
                    workflow["status"] = "waiting"
                    db.save_workflow(workflow)
                    db.add_event(workflow_id, f"Checkpoint waiting: {step['title']}")
                    return

                step["status"] = "completed"
                db.save_workflow(workflow)
                db.add_event(workflow_id, f"Completed step: {step['title']}")

            workflow["status"] = "completed"
            workflow["current_step"] = None
            db.save_workflow(workflow)
            db.add_event(workflow_id, "Workflow completed.")
        except Exception as exc:
            workflow = db.get_workflow(workflow_id)
            workflow["status"] = "failed"
            db.save_workflow(workflow)
            db.add_event(workflow_id, f"Workflow failed: {exc}", level="error")

    async def _run_step(self, workflow: dict[str, Any], step: dict[str, Any], llm: LLMClient) -> dict[str, Any]:
        workspace = Path(workflow["workspace"])
        system = (
            "You are a rigorous mathematical modeling and research writing agent. "
            "Write concise, reproducible, contest-ready artifacts."
        )
        prompt = self._prompt_for_step(workflow, step)
        content = await llm.complete(system, prompt)

        if step["id"] == "experiment":
            rel_path = "code/main.py"
            content = self._code_scaffold(workflow)
            kind = "code"
        elif "paper" in step["id"] or step["id"] == "latex_draft":
            rel_path = "paper/main.tex" if step["id"] in {"paper_draft", "latex_draft"} else f"paper/{step['id']}.md"
            if rel_path.endswith(".tex"):
                content = self._latex_scaffold(workflow, content)
            kind = "paper"
        else:
            rel_path = f"reports/{step['id']}.md"
            kind = "markdown"

        path = write_text_artifact(workspace, rel_path, content)
        return db.add_artifact(workflow["id"], step["id"], step["title"], path, kind)

    def _prompt_for_step(self, workflow: dict[str, Any], step: dict[str, Any]) -> str:
        return f"""
Workflow title: {workflow['title']}
Kind: {workflow['kind']}
Preset: {workflow['preset']}
Language: {workflow['language']}
Coding tool: {workflow['coding_tool']}
Page limit: {workflow.get('page_limit') or 'not specified'}

Problem text:
{(workflow.get('problem_text') or '(not provided)')[:80_000]}

Requirements:
{workflow.get('requirements') or '(not provided)'}

Current step:
{step['title']} ({step['id']})

Produce the artifact for this step. Include assumptions, decisions, and next actions.
""".strip()

    def _code_scaffold(self, workflow: dict[str, Any]) -> str:
        return f'''"""
Experiment scaffold for: {workflow["title"]}

Replace the placeholders with real data loading, modeling, plotting, and evaluation code.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FIGURES = ROOT / "figures"
TABLES = ROOT / "tables"


def main():
    FIGURES.mkdir(exist_ok=True)
    TABLES.mkdir(exist_ok=True)
    print("Experiment scaffold is ready.")


if __name__ == "__main__":
    main()
'''

    def _latex_scaffold(self, workflow: dict[str, Any], body: str) -> str:
        title = workflow["title"].replace("&", "\\&").replace("_", "\\_")
        safe_body = body.replace("\\", "\\textbackslash{}").replace("&", "\\&").replace("_", "\\_")
        return rf"""\documentclass[12pt]{{article}}
\usepackage[UTF8]{{ctex}}
\usepackage{{amsmath,amssymb,graphicx,booktabs,geometry}}
\geometry{{a4paper,margin=2.5cm}}
\title{{{title}}}
\author{{MathModel-Agent}}
\date{{\today}}

\begin{{document}}
\maketitle

\begin{{abstract}}
This is an MVP-generated draft. Replace this abstract with the final problem-specific summary.
\end{{abstract}}

\section{{Draft Notes}}
\begin{{verbatim}}
{safe_body[:4000]}
\end{{verbatim}}

\section{{Next Steps}}
Complete data analysis, validate code outputs, polish figures, and run a final review pass.

\end{{document}}
"""


engine = WorkflowEngine()
