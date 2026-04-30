const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");

const BACKEND_PORT = process.env.MMA_BACKEND_PORT || "18089";
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let backendProcess = null;

function backendPython() {
  const candidates = [
    path.join(__dirname, "..", "backend", ".venv", "Scripts", "python.exe"),
    "python"
  ];
  return candidates.find((candidate) => candidate === "python" || fs.existsSync(candidate)) || "python";
}

function startBackend() {
  const backendDir = path.join(__dirname, "..", "backend");
  const python = backendPython();
  backendProcess = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", BACKEND_PORT],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        MMA_BACKEND_PORT: BACKEND_PORT,
        PYTHONPATH: backendDir
      },
      windowsHide: true
    }
  );

  backendProcess.stdout.on("data", (chunk) => {
    console.log(`[backend] ${chunk.toString()}`);
  });
  backendProcess.stderr.on("data", (chunk) => {
    console.error(`[backend] ${chunk.toString()}`);
  });
  backendProcess.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
  });
}

function waitForBackend(timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BACKEND_URL}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(800, () => {
        req.destroy();
        retry();
      });

      function retry() {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Backend did not become ready in time."));
          return;
        }
        setTimeout(tick, 400);
      }
    };
    tick();
  });
}

async function createWindow() {
  startBackend();
  try {
    await waitForBackend();
  } catch (error) {
    dialog.showErrorBox("Backend failed to start", String(error));
  }

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: "MathModel-Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.MMA_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
