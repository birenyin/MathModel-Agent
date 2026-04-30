import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  API_BASE,
  Artifact,
  EventItem,
  Settings,
  Skill,
  TextPreview,
  Upload,
  Workflow,
  WorkspaceFile,
  apiGet,
  apiPost,
  apiPostForm,
  apiPut
} from "./api";

const presets = [
  ["cumcm", "CUMCM"],
  ["huawei", "Huawei Cup"],
  ["mathorcup", "MathorCup"],
  ["mcm", "MCM/ICM"],
  ["stats", "Statistics Modeling"]
];

const defaultSettings: Settings = {
  model_base_url: "",
  model_name: "",
  model_api_key: "",
  reviewer_base_url: "",
  reviewer_model_name: "",
  reviewer_api_key: "",
  texlive_bin: ""
};

export function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [preview, setPreview] = useState<TextPreview | null>(null);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [title, setTitle] = useState("New modeling workflow");
  const [preset, setPreset] = useState("cumcm");
  const [problemText, setProblemText] = useState("");
  const [requirements, setRequirements] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => workflows.find((item) => item.id === selectedId) ?? workflows[0],
    [workflows, selectedId]
  );

  async function refresh() {
    const list = await apiGet<Workflow[]>("/api/workflows");
    setWorkflows(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }

  async function refreshDetails(workflowId: string) {
    const [ev, ar, up, files] = await Promise.all([
      apiGet<EventItem[]>(`/api/workflows/${workflowId}/events`),
      apiGet<Artifact[]>(`/api/workflows/${workflowId}/artifacts`),
      apiGet<Upload[]>(`/api/workflows/${workflowId}/uploads`),
      apiGet<WorkspaceFile[]>(`/api/workflows/${workflowId}/files`)
    ]);
    setEvents(ev);
    setArtifacts(ar);
    setUploads(up);
    setWorkspaceFiles(files);
  }

  async function loadSettings() {
    const saved = await apiGet<Settings>("/api/settings");
    setSettings({ ...defaultSettings, ...saved, model_api_key: "", reviewer_api_key: "" });
  }

  async function loadSkills() {
    const available = await apiGet<Skill[]>("/api/skills");
    setSkills(available);
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
    loadSettings().catch(() => undefined);
    loadSkills().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selected?.id) return;
    clearPreview();
    refreshDetails(selected.id).catch((err) => setError(String(err)));
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
      refreshDetails(selected.id).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [selected?.id]);

  async function createWorkflow() {
    setError("");
    const item = await apiPost<Workflow>("/api/workflows", {
      kind: "contest",
      preset,
      title: title.trim() || "New modeling workflow",
      problem_text: problemText,
      requirements,
      language: "zh",
      coding_tool: "python"
    });
    setSelectedId(item.id);
    setProblemText("");
    await refresh();
  }

  async function saveSettings() {
    setError("");
    await apiPost<Settings>("/api/settings", settings);
    await loadSettings();
  }

  async function startWorkflow() {
    if (!selected) return;
    await apiPost(`/api/workflows/${selected.id}/start`);
    await refresh();
  }

  async function approveWorkflow() {
    if (!selected) return;
    await apiPost(`/api/workflows/${selected.id}/approve`, { note: "approved in UI" });
    await refresh();
  }

  async function rerunStep(stepId: string) {
    if (!selected) return;
    setError("");
    await apiPost(`/api/workflows/${selected.id}/steps/${stepId}/rerun`);
    await refresh();
    await refreshDetails(selected.id);
  }

  async function compileWorkflow() {
    if (!selected) return;
    const result = await apiPost<{ ok: boolean; log: string; pdf_path: string }>(`/api/workflows/${selected.id}/compile`);
    setActiveFile(null);
    setEditorDirty(false);
    setPreview({ id: "compile", filename: result.ok ? "Compile succeeded" : "Compile failed", text: result.log });
    await refreshDetails(selected.id);
  }

  async function exportWorkflow() {
    if (!selected) return;
    await apiPost<Artifact>(`/api/workflows/${selected.id}/export`);
    await refreshDetails(selected.id);
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    if (!selected || !event.target.files?.[0]) return;
    const body = new FormData();
    body.append("file", event.target.files[0]);
    await apiPostForm<Upload>(`/api/workflows/${selected.id}/uploads`, body);
    event.target.value = "";
    await refreshDetails(selected.id);
  }

  async function previewArtifact(artifact: Artifact) {
    try {
      const item = await apiGet<TextPreview>(`/api/artifacts/${artifact.id}/text`);
      setActiveFile(null);
      setEditorDirty(false);
      setPreview({ ...item, filename: artifact.title });
    } catch {
      window.open(`${API_BASE}/api/artifacts/${artifact.id}/file`, "_blank");
    }
  }

  async function previewUpload(upload: Upload) {
    const item = await apiGet<TextPreview>(`/api/uploads/${upload.id}/text`);
    setPreview(item);
    setActiveFile(null);
    setEditorDirty(false);
  }

  async function openWorkspaceFile(file: WorkspaceFile) {
    if (!selected) return;
    if (!file.text_previewable) {
      setPreview({ id: file.path, filename: file.path, text: "This file is not editable text." });
      setActiveFile(null);
      setEditorDirty(false);
      return;
    }
    const item = await apiGet<TextPreview>(
      `/api/workflows/${selected.id}/files/content?path=${encodeURIComponent(file.path)}`
    );
    setActiveFile(file);
    setEditorText(item.text);
    setEditorDirty(false);
    setPreview(null);
  }

  async function saveWorkspaceFile() {
    if (!selected || !activeFile) return;
    await apiPut(`/api/workflows/${selected.id}/files/content?path=${encodeURIComponent(activeFile.path)}`, {
      content: editorText
    });
    setEditorDirty(false);
    await refreshDetails(selected.id);
  }

  function clearPreview() {
    setPreview(null);
    setActiveFile(null);
    setEditorText("");
    setEditorDirty(false);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">M</div>
          <div>
            <h1>MathModel-Agent</h1>
            <p>Contest and research workflow agent</p>
          </div>
        </div>

        <section className="panel compact">
          <h2>Model Settings</h2>
          <label>
            Base URL
            <input
              value={settings.model_base_url ?? ""}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => setSettings({ ...settings, model_base_url: e.target.value })}
            />
          </label>
          <label>
            Model
            <input
              value={settings.model_name ?? ""}
              placeholder="gpt-4.1 / claude compatible model"
              onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={settings.model_api_key ?? ""}
              placeholder="Leave blank to keep fallback mode"
              onChange={(e) => setSettings({ ...settings, model_api_key: e.target.value })}
            />
          </label>
          <label>
            TeX bin path
            <input
              value={settings.texlive_bin ?? ""}
              placeholder="Optional path containing xelatex.exe"
              onChange={(e) => setSettings({ ...settings, texlive_bin: e.target.value })}
            />
          </label>
          <button onClick={saveSettings}>Save Settings</button>
        </section>

        <section className="panel compact">
          <h2>New Workflow</h2>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Preset
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {presets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Problem Text
            <textarea value={problemText} onChange={(e) => setProblemText(e.target.value)} rows={5} />
          </label>
          <label>
            Requirements
            <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={4} />
          </label>
          <button className="primary" onClick={createWorkflow}>
            Create
          </button>
        </section>

        <section className="panel compact">
          <h2>Workflows</h2>
          <div className="workflow-list">
            {workflows.map((item) => (
              <button
                key={item.id}
                className={item.id === selected?.id ? "active item" : "item"}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.title}</strong>
                <span>{item.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel compact">
          <h2>Skills</h2>
          <div className="skill-list">
            {skills.map((skill) => (
              <div key={skill.id} className="skill-pill" title={skill.path}>
                <strong>{skill.title}</strong>
                <span>{skill.description || skill.id}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="main">
        {error && <div className="error">{error}</div>}
        {selected ? (
          <>
            <section className="header">
              <div>
                <p className="eyebrow">
                  {selected.kind} / {selected.preset}
                </p>
                <h2>{selected.title}</h2>
                <p className="workspace">{selected.workspace}</p>
              </div>
              <div className="actions">
                <label className="upload-button">
                  Upload material
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.tex,.csv,.xlsx,.xlsm,.py,.m,.json"
                    onChange={uploadFile}
                  />
                </label>
                <button onClick={startWorkflow}>Start</button>
                <button onClick={compileWorkflow}>Compile</button>
                <button onClick={exportWorkflow}>Export</button>
                <button onClick={approveWorkflow} disabled={selected.status !== "waiting"}>
                  Approve checkpoint
                </button>
              </div>
            </section>

            <section className="grid">
              <div className="panel">
                <h3>Steps</h3>
                <div className="steps">
                  {selected.steps.map((step, index) => (
                    <div className={`step ${step.status}`} key={step.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <small>
                          {step.status}
                          {step.checkpoint ? " / checkpoint" : ""}
                        </small>
                      </div>
                      <button className="small" onClick={() => rerunStep(step.id)} disabled={selected.status === "running"}>
                        Rerun
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h3>Events</h3>
                <div className="log">
                  {events.map((event) => (
                    <p key={event.id} className={event.level}>
                      <time>{new Date(event.created_at).toLocaleTimeString()}</time>
                      {event.message}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid lower">
              <section className="panel artifacts">
                <h3>Input Materials</h3>
                {uploads.length === 0 ? (
                  <p className="muted">No uploaded files yet.</p>
                ) : (
                  <div className="artifact-list">
                    {uploads.map((upload) => (
                      <button key={upload.id} onClick={() => previewUpload(upload)}>
                        <strong>{upload.filename}</strong>
                        <span>{upload.extracted_chars.toLocaleString()} extracted chars</span>
                        <small>{upload.path}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel artifacts">
                <h3>Artifacts</h3>
                {artifacts.length === 0 ? (
                  <p className="muted">No artifacts yet.</p>
                ) : (
                  <div className="artifact-list">
                    {artifacts.map((artifact) => (
                      <button key={artifact.id} onClick={() => previewArtifact(artifact)}>
                        <strong>{artifact.title}</strong>
                        <span>{artifact.kind}</span>
                        <small>{artifact.path}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel artifacts">
                <h3>Workspace Files</h3>
                {workspaceFiles.length === 0 ? (
                  <p className="muted">No workspace files yet.</p>
                ) : (
                  <div className="artifact-list">
                    {workspaceFiles.map((file) => (
                      <button key={file.path} onClick={() => openWorkspaceFile(file)}>
                        <strong>{file.path}</strong>
                        <span>{file.text_previewable ? "editable text" : "binary or external file"}</span>
                        <small>{file.size.toLocaleString()} bytes</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </section>

            <section className="panel preview">
              <div className="preview-head">
                <h3>{activeFile?.path ?? preview?.filename ?? "Preview"}</h3>
                <div className="preview-actions">
                  {activeFile && (
                    <button onClick={saveWorkspaceFile} disabled={!editorDirty}>
                      Save
                    </button>
                  )}
                  {(activeFile || preview) && <button onClick={clearPreview}>Clear</button>}
                </div>
              </div>
              {activeFile ? (
                <textarea
                  className="editor"
                  value={editorText}
                  rows={20}
                  onChange={(event) => {
                    setEditorText(event.target.value);
                    setEditorDirty(true);
                  }}
                />
              ) : preview ? (
                <pre>{preview.text}</pre>
              ) : (
                <p className="muted">Select an input, artifact, or workspace file to preview text.</p>
              )}
            </section>
          </>
        ) : (
          <section className="empty">
            <h2>Create a workflow to begin.</h2>
          </section>
        )}
      </main>
    </div>
  );
}
