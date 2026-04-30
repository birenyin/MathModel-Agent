# MathModel-Agent

An independent desktop agent for mathematical modeling contests and research writing.

This project intentionally does not copy Modex-MH-Agent code, branding, encrypted skills,
or bundled assets. It recreates the product pattern with a clean implementation:

- Electron desktop shell
- React/Vite renderer
- Python FastAPI backend
- SQLite state store
- Workflow engine with checkpoints
- Local artifact workspace
- OpenAI-compatible model provider abstraction
- Modeling contest templates
- Uploaded material extraction for PDF, DOCX, TXT, CSV, and XLSX
- Workspace export as ZIP
- LaTeX compile endpoint for generated `paper/main.tex`

## MVP scope

The first useful product loop is:

1. Create a contest or paper workflow.
2. Attach problem text and requirements.
3. Run staged steps.
4. Pause at important checkpoints.
5. Generate artifacts under a local workspace.
6. Edit, rerun, export, and review.

Current implemented actions:

- create contest workflows
- upload problem/material files
- extract text into the workflow context
- run staged workflow artifacts in fallback mode or with a configured model
- approve checkpoint steps
- preview text artifacts
- compile LaTeX when `xelatex` is available
- export the workspace as a zip archive

## Project layout

```text
desktop/              Electron main/preload process
frontend/             React UI
backend/              FastAPI backend and workflow engine
backend/skills/       First-party skill prompts
docs/                 Product and architecture notes
scripts/              Local development helpers
```

## Development

Prerequisites:

- Node.js 20+
- Python 3.11+

Install frontend/desktop dependencies:

```powershell
npm install
```

Create backend environment:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

Run the desktop app in development:

```powershell
npm run dev
```

The Electron process starts the Python backend on `127.0.0.1:18089`, then opens the UI.

## Model settings

The backend supports OpenAI-compatible chat-completions endpoints. If no model key is
configured, it falls back to deterministic draft text so the workflow can still be tested.

Settings are stored in `.data/app.db`.

## Packaging path

For a real product release, add:

- portable Python runtime
- optional portable Git
- optional TeX/MiKTeX or TeX Live runtime
- electron-builder Windows installer
- auto update channel
- signed executable
