from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import db
from .config import APP_NAME, APP_VERSION, WORKSPACES_DIR, ensure_runtime_dirs
from .models import SettingsUpdate, StepApproval, WorkflowCreate
from .services.artifacts import safe_workspace_name
from .services.workflow_engine import engine
from .workflows.templates import build_steps

app = FastAPI(title=APP_NAME, version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    ensure_runtime_dirs()
    db.init_db()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "name": APP_NAME, "version": APP_VERSION}


@app.get("/api/settings")
async def get_settings() -> dict[str, str]:
    return db.get_settings()


@app.post("/api/settings")
async def save_settings(payload: SettingsUpdate) -> dict[str, str]:
    return db.set_settings(payload.model_dump())


@app.get("/api/workflows")
async def list_workflows() -> list[dict]:
    return db.list_workflows()


@app.post("/api/workflows")
async def create_workflow(payload: WorkflowCreate) -> dict:
    steps = build_steps(payload.kind, payload.preset)
    workspace_name = safe_workspace_name(payload.title)
    workspace = WORKSPACES_DIR / workspace_name
    suffix = 1
    base_workspace = workspace
    while workspace.exists():
        suffix += 1
        workspace = Path(f"{base_workspace}-{suffix}")
    return db.create_workflow(payload.model_dump(), steps, workspace)


@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> dict:
    try:
        return db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")


@app.post("/api/workflows/{workflow_id}/start")
async def start_workflow(workflow_id: str) -> dict[str, str]:
    try:
        db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    engine.start(workflow_id)
    return {"status": "started"}


@app.post("/api/workflows/{workflow_id}/approve")
async def approve_workflow(workflow_id: str, payload: StepApproval) -> dict[str, str]:
    try:
        db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    await engine.approve_and_resume(workflow_id, payload.note)
    return {"status": "approved"}


@app.get("/api/workflows/{workflow_id}/events")
async def list_events(workflow_id: str) -> list[dict]:
    return db.list_events(workflow_id)


@app.get("/api/workflows/{workflow_id}/artifacts")
async def list_artifacts(workflow_id: str) -> list[dict]:
    return db.list_artifacts(workflow_id)


@app.get("/api/artifacts/{artifact_id}/file")
async def artifact_file(artifact_id: str):
    for workflow in db.list_workflows():
        for artifact in db.list_artifacts(workflow["id"]):
            if artifact["id"] == artifact_id:
                path = Path(artifact["path"])
                if path.exists():
                    return FileResponse(path)
    raise HTTPException(status_code=404, detail="artifact not found")

