from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import db
from .config import APP_NAME, APP_VERSION, WORKSPACES_DIR, ensure_runtime_dirs
from .models import SettingsUpdate, StepApproval, WorkflowCreate, WorkspaceFileUpdate
from .services.artifacts import safe_workspace_name
from .services.file_extractors import extract_text, sanitize_filename
from .services.skills import list_skills
from .services.workflow_engine import engine
from .services.workspace_files import is_embeddable, list_workspace_files, read_workspace_text, resolve_workspace_path, write_workspace_text
from .services.workspace_ops import compile_latex, zip_workspace
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


@app.get("/api/skills")
async def api_list_skills() -> list[dict[str, str]]:
    return [
        {
            "id": skill.id,
            "title": skill.title,
            "description": skill.description,
            "path": str(skill.path),
        }
        for skill in list_skills()
    ]


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


@app.post("/api/workflows/{workflow_id}/steps/{step_id}/rerun")
async def rerun_workflow_step(workflow_id: str, step_id: str) -> dict[str, str]:
    try:
        db.get_workflow(workflow_id)
        started = engine.rerun_from_step(workflow_id, step_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow or step not found")
    if not started:
        raise HTTPException(status_code=409, detail="workflow is already running")
    return {"status": "started"}


@app.get("/api/workflows/{workflow_id}/events")
async def list_events(workflow_id: str) -> list[dict]:
    return db.list_events(workflow_id)


@app.get("/api/workflows/{workflow_id}/artifacts")
async def list_artifacts(workflow_id: str) -> list[dict]:
    return db.list_artifacts(workflow_id)


@app.get("/api/workflows/{workflow_id}/files")
async def list_files(workflow_id: str) -> list[dict]:
    try:
        workflow = db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    return list_workspace_files(Path(workflow["workspace"]))


@app.get("/api/workflows/{workflow_id}/files/content")
async def read_file(workflow_id: str, path: str = Query(...)) -> dict[str, str]:
    try:
        workflow = db.get_workflow(workflow_id)
        text = read_workspace_text(Path(workflow["workspace"]), path)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="file not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": path, "filename": path, "text": text}


@app.get("/api/workflows/{workflow_id}/files/raw")
async def raw_file(workflow_id: str, path: str = Query(...)):
    try:
        workflow = db.get_workflow(workflow_id)
        file_path = resolve_workspace_path(Path(workflow["workspace"]), path)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    if not is_embeddable(file_path):
        raise HTTPException(status_code=400, detail="file cannot be embedded")
    return FileResponse(file_path, filename=file_path.name, content_disposition_type="inline")


@app.put("/api/workflows/{workflow_id}/files/content")
async def save_file(workflow_id: str, payload: WorkspaceFileUpdate, path: str = Query(...)) -> dict[str, str]:
    try:
        workflow = db.get_workflow(workflow_id)
        saved = write_workspace_text(Path(workflow["workspace"]), path, payload.content)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    rel_path = saved.relative_to(Path(workflow["workspace"]).resolve())
    db.add_event(workflow_id, f"Saved workspace file: {rel_path}")
    return {"status": "saved", "path": path}


@app.post("/api/workflows/{workflow_id}/uploads")
async def upload_workflow_file(workflow_id: str, file: UploadFile) -> dict:
    try:
        workflow = db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")

    filename = sanitize_filename(file.filename or "upload")
    upload_dir = Path(workflow["workspace"]) / "input"
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / filename
    suffix = 1
    base_destination = destination
    while destination.exists():
        suffix += 1
        destination = base_destination.with_name(f"{base_destination.stem}-{suffix}{base_destination.suffix}")

    content = await file.read()
    destination.write_bytes(content)
    extracted = extract_text(destination)
    upload = db.add_upload(
        workflow_id,
        destination.name,
        destination,
        file.content_type or "application/octet-stream",
        extracted,
    )
    db.append_workflow_problem_text(workflow_id, f"# {destination.name}\n\n{extracted}")
    db.add_event(workflow_id, f"Uploaded and extracted {destination.name} ({len(extracted)} chars).")
    return upload


@app.get("/api/workflows/{workflow_id}/uploads")
async def list_workflow_uploads(workflow_id: str) -> list[dict]:
    return db.list_uploads(workflow_id)


@app.get("/api/uploads/{upload_id}/text")
async def upload_text(upload_id: str) -> dict[str, str]:
    try:
        upload = db.get_upload(upload_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="upload not found")
    return {
        "id": upload["id"],
        "filename": upload["filename"],
        "text": upload["extracted_text"],
    }


@app.get("/api/artifacts/{artifact_id}/file")
async def artifact_file(artifact_id: str):
    try:
        artifact = db.get_artifact(artifact_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="artifact not found")
    path = Path(artifact["path"])
    if path.exists():
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="artifact not found")


@app.get("/api/artifacts/{artifact_id}/text")
async def artifact_text(artifact_id: str) -> dict[str, str]:
    try:
        artifact = db.get_artifact(artifact_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="artifact not found")
    path = Path(artifact["path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="artifact file not found")
    if path.suffix.lower() not in {".md", ".txt", ".tex", ".py", ".json", ".csv", ".m"}:
        raise HTTPException(status_code=400, detail="artifact is not text-previewable")
    return {"id": artifact_id, "text": path.read_text(encoding="utf-8", errors="replace")}


@app.post("/api/workflows/{workflow_id}/compile")
async def compile_workflow(workflow_id: str) -> dict:
    try:
        workflow = db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")

    workspace = Path(workflow["workspace"])
    settings = db.get_settings()
    ok, log, pdf_path = compile_latex(workspace, settings.get("texlive_bin"))
    log_path = workspace / "paper" / "compile.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(log, encoding="utf-8", errors="replace")
    db.add_artifact(workflow_id, "compile", "LaTeX compile log", log_path, "log")
    if pdf_path:
        db.add_artifact(workflow_id, "compile", "Compiled PDF", pdf_path, "pdf")
    db.add_event(workflow_id, "LaTeX compilation succeeded." if ok else "LaTeX compilation failed.", "info" if ok else "error")
    pdf_rel_path = ""
    if pdf_path:
        try:
            pdf_rel_path = pdf_path.resolve().relative_to(workspace.resolve()).as_posix()
        except ValueError:
            pdf_rel_path = ""
    return {"ok": ok, "log": log[-8000:], "pdf_path": str(pdf_path) if pdf_path else "", "pdf_rel_path": pdf_rel_path}


@app.post("/api/workflows/{workflow_id}/export")
async def export_workflow(workflow_id: str) -> dict:
    try:
        workflow = db.get_workflow(workflow_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="workflow not found")
    archive = zip_workspace(Path(workflow["workspace"]))
    artifact = db.add_artifact(workflow_id, "export", "Workspace export", archive, "zip")
    db.add_event(workflow_id, f"Workspace exported: {archive}")
    return artifact
