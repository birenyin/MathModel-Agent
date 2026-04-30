from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

WorkflowKind = Literal["contest", "paper", "research"]


class WorkflowCreate(BaseModel):
    kind: WorkflowKind = "contest"
    preset: str = "cumcm"
    title: str = Field(min_length=1, max_length=180)
    problem_text: str = ""
    requirements: str = ""
    language: str = "zh"
    coding_tool: str = "python"
    page_limit: int | None = None


class SettingsUpdate(BaseModel):
    model_base_url: str = ""
    model_name: str = ""
    model_api_key: str = ""
    reviewer_base_url: str = ""
    reviewer_model_name: str = ""
    reviewer_api_key: str = ""


class StepApproval(BaseModel):
    note: str = ""


class WorkflowResponse(BaseModel):
    id: str
    kind: str
    preset: str
    title: str
    status: str
    workspace: str
    current_step: str | None = None
    steps: list[dict[str, Any]]


class ArtifactResponse(BaseModel):
    id: str
    workflow_id: str
    step_id: str
    title: str
    path: str
    kind: str

