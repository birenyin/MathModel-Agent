# Product Spec

## Product goal

Build a desktop AI workbench for mathematical modeling contests and research writing.
The app should help users move from problem statement to reproducible code, figures,
paper draft, PDF compilation, and review.

## Primary workflows

### Contest workflow

Supported presets:

- CUMCM / national contest
- Huawei Cup / GMCM
- MathorCup
- Electrician Cup
- WuYi Cup
- APMCM
- MCM / ICM
- Statistics modeling contest

Stages:

1. Problem analysis
2. Modeling plan
3. Data/code plan
4. Code and experiment
5. Figures and tables
6. Paper draft
7. Compile/export
8. Review loop

### Research workflow

Supported presets:

- idea discovery
- literature review
- experiment bridge
- paper writing
- auto review loop

## MVP acceptance criteria

- The app launches as a desktop app.
- The backend starts automatically.
- A user can create a workflow.
- A workflow can run step by step.
- Checkpoint steps pause and can resume.
- Artifacts appear in the workspace and UI.
- API settings can be saved.
- The product still demos without an API key by using fallback drafts.
- Problem PDFs, DOCX files, spreadsheets, CSV files, and text files can be uploaded.
- Uploaded text is added to the workflow context.
- Text artifacts can be previewed in the app.
- A workflow workspace can be exported as a zip archive.
- Generated LaTeX can be compiled when a TeX runtime is configured.
- First-party Markdown skills can be listed in the UI.
- Workflow steps automatically receive relevant skill prompts.

## Non-goals for the first MVP

- exact feature parity with any existing app
- copying third-party UI/assets/skills
- encrypted commercial skill distribution
- fully bundled runtime installer
- multi-user cloud sync
