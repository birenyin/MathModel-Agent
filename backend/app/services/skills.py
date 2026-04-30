from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..config import BASE_DIR

SKILLS_DIR = BASE_DIR / "skills"


@dataclass(frozen=True)
class Skill:
    id: str
    title: str
    description: str
    path: Path
    body: str


def list_skills() -> list[Skill]:
    if not SKILLS_DIR.exists():
        return []

    skills: list[Skill] = []
    for skill_file in sorted(SKILLS_DIR.glob("*/SKILL.md")):
        body = skill_file.read_text(encoding="utf-8", errors="replace")
        title, description = _parse_heading_and_description(body, skill_file.parent.name)
        skills.append(
            Skill(
                id=skill_file.parent.name,
                title=title,
                description=description,
                path=skill_file,
                body=body,
            )
        )
    return skills


def get_skill(skill_id: str) -> Skill | None:
    for skill in list_skills():
        if skill.id == skill_id:
            return skill
    return None


def select_skills_for_step(step_id: str, kind: str, preset: str) -> list[Skill]:
    candidates: list[str] = []
    if step_id == "problem_analysis":
        _add_candidate(candidates, "contest-problem-analysis")
    if step_id in {"idea_brief", "literature_plan", "related_work", "paper_outline"}:
        _add_candidate(candidates, "research-literature")
    if step_id in {
        "model_plan",
        "code_plan",
        "experiment",
        "method_section",
        "experiment_section",
        "experiment_plan",
        "implementation_plan",
    }:
        _add_candidate(candidates, "modeling-code")
    if step_id == "figures_tables":
        _add_candidate(candidates, "figure-table-plan")
    if step_id in {"paper_outline", "paper_draft", "method_section", "experiment_section", "latex_draft", "compile_export"}:
        _add_candidate(candidates, "modeling-paper")
    if step_id == "review":
        _add_candidate(candidates, "reviewer")
    if preset == "stats":
        _add_candidate(candidates, "statistics-topic")

    result: list[Skill] = []
    for skill_id in candidates:
        skill = get_skill(skill_id)
        if skill is not None:
            result.append(skill)
    return result


def _add_candidate(candidates: list[str], skill_id: str) -> None:
    if skill_id not in candidates:
        candidates.append(skill_id)


def skill_prompt_block(skills: list[Skill], max_chars: int = 18_000) -> str:
    if not skills:
        return ""

    chunks: list[str] = ["Relevant local skills:"]
    total = 0
    for skill in skills:
        body = skill.body[: max_chars - total]
        chunks.append(f"\n\n--- Skill: {skill.title} ({skill.id}) ---\n{body}")
        total += len(body)
        if total >= max_chars:
            break
    return "\n".join(chunks)


def _parse_heading_and_description(body: str, fallback: str) -> tuple[str, str]:
    lines = [line.strip() for line in body.splitlines()]
    title = fallback
    description = ""
    for index, line in enumerate(lines):
        if line.startswith("# "):
            title = line[2:].strip()
            for next_line in lines[index + 1 :]:
                if next_line and not next_line.startswith("#"):
                    description = next_line
                    break
            break
    return title, description
