$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\.."

if (!(Test-Path "backend\.venv\Scripts\python.exe")) {
  python -m venv backend\.venv
}

backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install
npm run dev

Pop-Location

