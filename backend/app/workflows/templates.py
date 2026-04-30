from __future__ import annotations


def contest_steps(preset: str) -> list[dict]:
    return [
        step("problem_analysis", "Problem analysis", True),
        step("model_plan", "Modeling plan", True),
        step("code_plan", "Code and data plan", False),
        step("experiment", "Experiment/code scaffold", False),
        step("figures_tables", "Figures and tables plan", False),
        step("paper_draft", "Paper draft", True),
        step("compile_export", "Compile/export checklist", False),
        step("review", "Review report", False),
    ]


def paper_steps() -> list[dict]:
    return [
        step("paper_outline", "Paper outline", True),
        step("related_work", "Related work plan", False),
        step("method_section", "Method section", True),
        step("experiment_section", "Experiment section", False),
        step("latex_draft", "LaTeX draft", True),
        step("review", "Review report", False),
    ]


def research_steps() -> list[dict]:
    return [
        step("idea_brief", "Idea brief", True),
        step("literature_plan", "Literature plan", False),
        step("experiment_plan", "Experiment plan", True),
        step("implementation_plan", "Implementation plan", False),
        step("review", "Review report", False),
    ]


def build_steps(kind: str, preset: str) -> list[dict]:
    if kind == "paper":
        return paper_steps()
    if kind == "research":
        return research_steps()
    return contest_steps(preset)


def step(step_id: str, title: str, checkpoint: bool) -> dict:
    return {
        "id": step_id,
        "title": title,
        "status": "pending",
        "checkpoint": checkpoint,
        "artifact_path": None,
    }

