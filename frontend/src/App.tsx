import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  API_BASE,
  AgentChatResponse,
  AgentSuggestedAction,
  Artifact,
  CodeRunResult,
  EventItem,
  ModelTestResult,
  ReviewResult,
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

type CompileResult = {
  ok: boolean;
  log: string;
  pdf_path: string;
  pdf_rel_path?: string;
};

type EmbeddedPreview = {
  title: string;
  url: string;
  path?: string;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: string;
  suggested_actions?: AgentSuggestedAction[];
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
  const [embeddedPreview, setEmbeddedPreview] = useState<EmbeddedPreview | null>(null);
  const [compileLog, setCompileLog] = useState("");
  const [runLog, setRunLog] = useState("");
  const [modelTest, setModelTest] = useState<ModelTestResult | null>(null);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [runTimeoutSeconds, setRunTimeoutSeconds] = useState(120);
  const [title, setTitle] = useState("New modeling workflow");
  const [preset, setPreset] = useState("cumcm");
  const [problemText, setProblemText] = useState("");
  const [requirements, setRequirements] = useState("");
  const [error, setError] = useState("");
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "我会根据当前工作流、打开的文件、运行日志和编译结果给建议。可以直接问：下一步做什么、哪里报错、论文怎么改。"
    }
  ]);

  const selected = useMemo(
    () => workflows.find((item) => item.id === selectedId) ?? workflows[0],
    [workflows, selectedId]
  );
  const groupedWorkspaceFiles = useMemo(() => groupWorkspaceFiles(workspaceFiles), [workspaceFiles]);
  const latexLogSummary = useMemo(() => summarizeLatexLog(compileLog), [compileLog]);
  const generatedOutputs = useMemo(
    () =>
      workspaceFiles
        .filter((file) => ["figures", "tables"].includes(file.category) || file.suffix === ".pdf")
        .sort((left, right) => right.modified_at - left.modified_at)
        .slice(0, 12),
    [workspaceFiles]
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

  async function testModelSettings() {
    setError("");
    const result = await apiPost<ModelTestResult>("/api/settings/test", settings);
    setModelTest(result);
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
    const result = await apiPost<CompileResult>(`/api/workflows/${selected.id}/compile`);
    setActiveFile(null);
    setEditorDirty(false);
    setRunLog("");
    setCompileLog(result.log);
    if (result.pdf_rel_path) {
      setEmbeddedPreview({
        title: result.ok ? "Compiled PDF" : "Compiled PDF with errors",
        path: result.pdf_rel_path,
        url: workspaceRawUrl(selected.id, result.pdf_rel_path)
      });
    } else {
      setEmbeddedPreview(null);
    }
    setPreview({ id: "compile", filename: result.ok ? "Compile succeeded" : "Compile failed", text: result.log });
    await refreshDetails(selected.id);
  }

  async function exportWorkflow() {
    if (!selected) return;
    await apiPost<Artifact>(`/api/workflows/${selected.id}/export`);
    await refreshDetails(selected.id);
  }

  async function reviewWorkflow() {
    if (!selected) return;
    const result = await apiPost<ReviewResult>(`/api/workflows/${selected.id}/review`);
    setActiveFile(null);
    setEmbeddedPreview(null);
    setCompileLog("");
    setRunLog("");
    setPreview({ id: result.artifact.id, filename: `Review report (${result.mode})`, text: result.report });
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
    if (artifact.kind === "pdf" || artifact.path.toLowerCase().endsWith(".pdf")) {
      setActiveFile(null);
      setEditorDirty(false);
      setPreview(null);
      setCompileLog("");
      setRunLog("");
      setEmbeddedPreview({
        title: artifact.title,
        url: `${API_BASE}/api/artifacts/${artifact.id}/file?t=${Date.now()}`
      });
      return;
    }

    try {
      const item = await apiGet<TextPreview>(`/api/artifacts/${artifact.id}/text`);
      setActiveFile(null);
      setEditorDirty(false);
      setEmbeddedPreview(null);
      setCompileLog("");
      setRunLog("");
      setPreview({ ...item, filename: artifact.title });
    } catch {
      window.open(`${API_BASE}/api/artifacts/${artifact.id}/file`, "_blank");
    }
  }

  async function previewUpload(upload: Upload) {
    const item = await apiGet<TextPreview>(`/api/uploads/${upload.id}/text`);
    setPreview(item);
    setEmbeddedPreview(null);
    setCompileLog("");
    setRunLog("");
    setActiveFile(null);
    setEditorDirty(false);
  }

  async function openWorkspaceFile(file: WorkspaceFile) {
    if (!selected) return;
    if (file.embeddable && file.suffix === ".pdf") {
      setActiveFile(null);
      setEditorDirty(false);
      setEditorText("");
      setPreview(null);
      setCompileLog("");
      setRunLog("");
      setEmbeddedPreview({ title: file.path, path: file.path, url: workspaceRawUrl(selected.id, file.path) });
      return;
    }

    if (!file.text_previewable) {
      setPreview({ id: file.path, filename: file.path, text: "This file is not editable text." });
      setActiveFile(null);
      setEditorDirty(false);
      setEmbeddedPreview(file.embeddable ? { title: file.path, path: file.path, url: workspaceRawUrl(selected.id, file.path) } : null);
      setCompileLog("");
      setRunLog("");
      return;
    }

    const item = await apiGet<TextPreview>(
      `/api/workflows/${selected.id}/files/content?path=${encodeURIComponent(file.path)}`
    );
    setActiveFile(file);
    setEditorText(item.text);
    setEditorDirty(false);
    setPreview(null);
    setCompileLog("");
    setRunLog("");
    setEmbeddedPreview(findCompanionPreview(file, selected.id, workspaceFiles));
  }

  async function openMainTex() {
    const file =
      workspaceFiles.find((item) => item.path.toLowerCase() === "paper/main.tex") ??
      workspaceFiles.find((item) => item.name.toLowerCase() === "main.tex") ??
      workspaceFiles.find((item) => item.suffix === ".tex");
    if (file) await openWorkspaceFile(file);
  }

  async function openLatestPdf() {
    const file = latestFile(workspaceFiles.filter((item) => item.suffix === ".pdf"));
    if (file) await openWorkspaceFile(file);
  }

  async function openLatestLog() {
    const file = latestFile(workspaceFiles.filter((item) => item.suffix === ".log"));
    if (file) await openWorkspaceFile(file);
  }

  async function saveWorkspaceFile() {
    if (!selected || !activeFile) return;
    await apiPut(`/api/workflows/${selected.id}/files/content?path=${encodeURIComponent(activeFile.path)}`, {
      content: editorText
    });
    setEditorDirty(false);
    await refreshDetails(selected.id);
  }

  async function runActivePython() {
    if (!selected || !activeFile) return;
    if (editorDirty) {
      await saveWorkspaceFile();
    }
    const result = await apiPost<CodeRunResult>(
      `/api/workflows/${selected.id}/files/run?path=${encodeURIComponent(activeFile.path)}`,
      { timeout_seconds: runTimeoutSeconds }
    );
    setRunLog(formatRunResult(activeFile.path, result));
    await refreshDetails(selected.id);
  }

  async function explainRunResult() {
    if (!runLog) return;
    await sendAgentMessage(`请解释这个 Python 运行结果，并告诉我该优先修什么：\n\n${runLog.slice(-6000)}`);
  }

  async function sendAgentMessage(message = agentInput) {
    if (!selected) return;
    const text = message.trim();
    if (!text || agentBusy) return;
    setAgentInput("");
    setAgentBusy(true);
    setAgentMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), role: "user", content: text }
    ]);
    try {
      const response = await apiPost<AgentChatResponse>(`/api/workflows/${selected.id}/agent/chat`, {
        message: text,
        active_file_path: activeFile?.path ?? "",
        active_file_content: activeFile ? editorText : ""
      });
      setAgentMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.message,
          mode: response.mode,
          suggested_actions: response.suggested_actions
        }
      ]);
    } catch (err) {
      setError(String(err));
    } finally {
      setAgentBusy(false);
    }
  }

  async function handleAgentAction(actionId: string) {
    if (!selected) return;
    if (actionId === "run_python") {
      if (activeFile?.suffix === ".py") {
        await runActivePython();
        await sendAgentMessage("我刚运行了当前 Python 文件，请根据运行输出告诉我下一步怎么改。");
      } else {
        await sendAgentMessage("我想运行 Python，请告诉我应该先打开哪个 .py 文件。");
      }
      return;
    }
    if (actionId === "compile_latex") {
      if (activeFile?.suffix === ".tex") {
        await compileLatexPreview();
      } else {
        await compileWorkflow();
      }
      await sendAgentMessage("我刚编译了 LaTeX，请根据当前工作流告诉我如何处理编译结果。");
      return;
    }
    if (actionId === "open_pdf") {
      const pdf = [...workspaceFiles].reverse().find((file) => file.suffix === ".pdf");
      if (pdf) {
        await openWorkspaceFile(pdf);
      }
      return;
    }
    if (actionId === "review_next") {
      await sendAgentMessage("请根据当前工作流状态，列出下一步最应该做的三件事。");
    }
  }

  async function compileLatexPreview() {
    if (!selected) return;
    if (activeFile && editorDirty) {
      await saveWorkspaceFile();
    }
    const result = await apiPost<CompileResult>(`/api/workflows/${selected.id}/compile`);
    setCompileLog(result.log);
    if (result.pdf_rel_path) {
      setEmbeddedPreview({
        title: result.ok ? result.pdf_rel_path : `${result.pdf_rel_path} (compile failed)`,
        path: result.pdf_rel_path,
        url: workspaceRawUrl(selected.id, result.pdf_rel_path)
      });
      setPreview(null);
    } else {
      setEmbeddedPreview(null);
      setPreview({ id: "compile", filename: "Compile failed", text: result.log });
    }
    await refreshDetails(selected.id);
  }

  function insertLatexTemplate(kind: "structure" | "figure" | "table") {
    const block = latexTemplates[kind];
    setEditorText((content) => insertBeforeEndDocument(content, block));
    setEditorDirty(true);
  }

  function insertPythonScaffold() {
    setEditorText((content) => `${content.trimEnd()}\n\n${pythonScaffold.trim()}\n`);
    setEditorDirty(true);
  }

  async function explainCompileLog() {
    if (!compileLog) return;
    await sendAgentMessage(`请解释这个 LaTeX 编译日志，并告诉我最优先修哪三处：\n\n${compileLog.slice(-6000)}`);
  }

  function clearPreview() {
    setPreview(null);
    setEmbeddedPreview(null);
    setCompileLog("");
    setRunLog("");
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
            Reviewer Base URL
            <input
              value={settings.reviewer_base_url ?? ""}
              placeholder="Optional reviewer endpoint"
              onChange={(e) => setSettings({ ...settings, reviewer_base_url: e.target.value })}
            />
          </label>
          <label>
            Reviewer Model
            <input
              value={settings.reviewer_model_name ?? ""}
              placeholder="Optional reviewer model"
              onChange={(e) => setSettings({ ...settings, reviewer_model_name: e.target.value })}
            />
          </label>
          <label>
            Reviewer API Key
            <input
              type="password"
              value={settings.reviewer_api_key ?? ""}
              placeholder="Leave blank to reuse fallback/provider"
              onChange={(e) => setSettings({ ...settings, reviewer_api_key: e.target.value })}
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
          <div className="button-row">
            <button onClick={saveSettings}>Save Settings</button>
            <button onClick={testModelSettings}>Test Model</button>
          </div>
          {modelTest && (
            <div className={modelTest.ok ? "status-note" : "status-note error-note"}>
              <strong>{modelTest.mode}</strong>
              <span>{modelTest.message}</span>
            </div>
          )}
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
                <button onClick={reviewWorkflow}>Review</button>
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
                <div className="quick-actions">
                  <button className="small" onClick={openMainTex} disabled={!workspaceFiles.some((file) => file.suffix === ".tex")}>
                    main.tex
                  </button>
                  <button className="small" onClick={openLatestPdf} disabled={!workspaceFiles.some((file) => file.suffix === ".pdf")}>
                    Latest PDF
                  </button>
                  <button className="small" onClick={openLatestLog} disabled={!workspaceFiles.some((file) => file.suffix === ".log")}>
                    Latest Log
                  </button>
                </div>
                {workspaceFiles.length === 0 ? (
                  <p className="muted">No workspace files yet.</p>
                ) : (
                  <div className="file-tree">
                    {groupedWorkspaceFiles.map(([category, files]) => (
                      <div className="file-group" key={category}>
                        <h4>{categoryLabels[category] ?? category}</h4>
                        {files.map((file) => (
                          <button key={file.path} onClick={() => openWorkspaceFile(file)}>
                            <strong>{file.name}</strong>
                            <span>{file.path}</span>
                            <small>{fileMeta(file)}</small>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </section>

            <section className="panel preview">
              <div className="preview-head">
                <h3>{activeFile?.path ?? embeddedPreview?.title ?? preview?.filename ?? "Preview"}</h3>
                <div className="preview-actions">
                  {activeFile && (
                    <button onClick={saveWorkspaceFile} disabled={!editorDirty}>
                      Save
                    </button>
                  )}
                  {activeFile?.suffix === ".tex" && <button onClick={compileLatexPreview}>Compile PDF</button>}
                  {activeFile?.suffix === ".py" && <button onClick={runActivePython}>Run Python</button>}
                  {embeddedPreview && <button onClick={() => window.open(embeddedPreview.url, "_blank")}>Open</button>}
                  {(activeFile || preview || embeddedPreview) && <button onClick={clearPreview}>Clear</button>}
                </div>
              </div>
              {activeFile?.suffix === ".tex" ? (
                <div className="latex-workbench">
                  <div className="latex-toolbar">
                    <button className="small" onClick={() => insertLatexTemplate("structure")}>
                      Insert Sections
                    </button>
                    <button className="small" onClick={() => insertLatexTemplate("figure")}>
                      Figure
                    </button>
                    <button className="small" onClick={() => insertLatexTemplate("table")}>
                      Table
                    </button>
                    {compileLog && (
                      <button className="small" onClick={explainCompileLog}>
                        Explain Log
                      </button>
                    )}
                  </div>
                  <textarea
                    className="editor latex-editor"
                    value={editorText}
                    rows={20}
                    onChange={(event) => {
                      setEditorText(event.target.value);
                      setEditorDirty(true);
                    }}
                  />
                  <div className="pdf-pane">
                    {embeddedPreview ? (
                      <iframe title={embeddedPreview.title} src={embeddedPreview.url} />
                    ) : (
                      <div className="pdf-empty">
                        <strong>No PDF preview yet.</strong>
                        <span>Compile the LaTeX file to render a preview here.</span>
                      </div>
                    )}
                  </div>
                  {latexLogSummary && <pre className="compile-summary">{latexLogSummary}</pre>}
                  {compileLog && <pre className="compile-log">{compileLog}</pre>}
                </div>
              ) : activeFile?.suffix === ".py" ? (
                <div className="code-workbench">
                  <div className="code-toolbar">
                    <button className="small" onClick={runActivePython}>
                      Run
                    </button>
                    <label>
                      Timeout
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={runTimeoutSeconds}
                        onChange={(event) => setRunTimeoutSeconds(Math.max(1, Math.min(300, Number(event.target.value) || 1)))}
                      />
                    </label>
                    <button className="small" onClick={insertPythonScaffold}>
                      Main Scaffold
                    </button>
                    <button className="small" onClick={explainRunResult} disabled={!runLog}>
                      Explain Run
                    </button>
                    <button className="small" onClick={openLatestLog} disabled={!workspaceFiles.some((file) => file.suffix === ".log")}>
                      Latest Log
                    </button>
                  </div>
                  <textarea
                    className="editor code-editor"
                    value={editorText}
                    rows={20}
                    onChange={(event) => {
                      setEditorText(event.target.value);
                      setEditorDirty(true);
                    }}
                  />
                  <div className="run-column">
                    <pre className="run-pane">{runLog || "Run this Python file to see stdout and stderr here."}</pre>
                    <div className="output-list">
                      <h4>Generated Outputs</h4>
                      {generatedOutputs.length === 0 ? (
                        <p className="muted">No figures or tables yet.</p>
                      ) : (
                        generatedOutputs.map((file) => (
                          <button key={file.path} onClick={() => openWorkspaceFile(file)}>
                            <strong>{file.name}</strong>
                            <span>{file.path}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : activeFile ? (
                <textarea
                  className="editor"
                  value={editorText}
                  rows={20}
                  onChange={(event) => {
                    setEditorText(event.target.value);
                    setEditorDirty(true);
                  }}
                />
              ) : embeddedPreview ? (
                <>
                  <div className="pdf-pane full">
                    <iframe title={embeddedPreview.title} src={embeddedPreview.url} />
                  </div>
                  {compileLog && <pre className="compile-log">{compileLog}</pre>}
                </>
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

      <aside className="agent-dock">
        <div className="agent-head">
          <div>
            <h2>Agent</h2>
            <p>{selected ? selected.status : "No workflow"}</p>
          </div>
          {activeFile && <span>{activeFile.path}</span>}
        </div>
        <div className="agent-messages">
          {agentMessages.map((message) => (
            <div key={message.id} className={`agent-message ${message.role}`}>
              <div className="agent-meta">
                <strong>{message.role === "assistant" ? "Agent" : "You"}</strong>
                {message.mode && <span>{message.mode}</span>}
              </div>
              <p>{message.content}</p>
              {message.suggested_actions && message.suggested_actions.length > 0 && (
                <div className="agent-actions">
                  {message.suggested_actions.map((action) => (
                    <button key={action.id} className="small" title={action.description} onClick={() => handleAgentAction(action.id)}>
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {agentBusy && <div className="agent-message assistant"><p>Thinking...</p></div>}
        </div>
        <div className="agent-compose">
          <textarea
            value={agentInput}
            rows={3}
            placeholder="Ask Agent about the current workflow..."
            onChange={(event) => setAgentInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendAgentMessage().catch((err) => setError(String(err)));
              }
            }}
          />
          <button className="primary" onClick={() => sendAgentMessage()} disabled={!selected || agentBusy}>
            Send
          </button>
        </div>
      </aside>
    </div>
  );
}

function workspaceRawUrl(workflowId: string, path: string): string {
  return `${API_BASE}/api/workflows/${workflowId}/files/raw?path=${encodeURIComponent(path)}&t=${Date.now()}`;
}

function findCompanionPreview(file: WorkspaceFile, workflowId: string, files: WorkspaceFile[]): EmbeddedPreview | null {
  if (file.suffix !== ".tex") return null;
  const pdfPath = file.path.replace(/\.tex$/i, ".pdf");
  const companion = files.find((item) => item.path.toLowerCase() === pdfPath.toLowerCase());
  const fallback = files.find((item) => item.path.toLowerCase() === "paper/main.pdf");
  const match = companion ?? fallback;
  if (!match) return null;
  return { title: match.path, path: match.path, url: workspaceRawUrl(workflowId, match.path) };
}

const categoryOrder = ["paper", "code", "figures", "tables", "pdf", "logs", "reports", "input", "other"];

const categoryLabels: Record<string, string> = {
  paper: "Paper",
  code: "Code",
  figures: "Figures",
  tables: "Tables",
  pdf: "PDF",
  logs: "Logs",
  reports: "Reports",
  input: "Input",
  other: "Other"
};

function groupWorkspaceFiles(files: WorkspaceFile[]): Array<[string, WorkspaceFile[]]> {
  const groups = new Map<string, WorkspaceFile[]>();
  for (const file of files) {
    const items = groups.get(file.category) ?? [];
    items.push(file);
    groups.set(file.category, items);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => categoryRank(left) - categoryRank(right) || left.localeCompare(right))
    .map(([category, items]) => [
      category,
      items.sort((left, right) => left.path.localeCompare(right.path))
    ]);
}

function categoryRank(category: string): number {
  const index = categoryOrder.indexOf(category);
  return index === -1 ? 999 : index;
}

function latestFile(files: WorkspaceFile[]): WorkspaceFile | undefined {
  return [...files].sort((left, right) => right.modified_at - left.modified_at)[0];
}

function fileMeta(file: WorkspaceFile): string {
  const mode = file.text_previewable ? "editable" : file.embeddable ? "preview" : "file";
  return `${mode} / ${file.size.toLocaleString()} bytes`;
}

function formatRunResult(path: string, result: CodeRunResult): string {
  return [
    `Run target: ${path}`,
    `Status: ${result.ok ? "ok" : "failed"}`,
    `Exit code: ${result.exit_code}`,
    `Timed out: ${result.timed_out}`,
    `Elapsed seconds: ${result.elapsed_seconds.toFixed(2)}`,
    `Log artifact: ${result.log_path}`,
    "",
    "STDOUT",
    "------",
    result.stdout || "(empty)",
    "",
    "STDERR",
    "------",
    result.stderr || "(empty)"
  ].join("\n");
}

const latexTemplates = {
  structure: String.raw`
\section{Problem Restatement}

\section{Assumptions}

\section{Symbol Description}

\section{Model Construction}

\section{Solution and Results}

\section{Sensitivity Analysis}

\section{Strengths and Weaknesses}

\section{Conclusion}
`,
  figure: String.raw`
\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.82\textwidth]{figures/example.png}
  \caption{Replace with a claim-driven figure caption.}
  \label{fig:example}
\end{figure}
`,
  table: String.raw`
\begin{table}[htbp]
  \centering
  \caption{Replace with a result-focused table caption.}
  \label{tab:example}
  \begin{tabular}{lcc}
    \toprule
    Item & Metric A & Metric B \\
    \midrule
    Baseline & -- & -- \\
    Proposed & -- & -- \\
    \bottomrule
  \end{tabular}
\end{table}
`
};

const pythonScaffold = `
def main():
    """Run the modeling experiment from the workspace root."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    figures = root / "figures"
    tables = root / "tables"
    figures.mkdir(exist_ok=True)
    tables.mkdir(exist_ok=True)

    # TODO: load data, run model, save figures and tables.
    print("Experiment finished.")


if __name__ == "__main__":
    main()
`;

function insertBeforeEndDocument(content: string, block: string): string {
  const marker = "\\end{document}";
  const cleanBlock = block.trim();
  const index = content.lastIndexOf(marker);
  if (index === -1) {
    return `${content.trimEnd()}\n\n${cleanBlock}\n`;
  }
  return `${content.slice(0, index).trimEnd()}\n\n${cleanBlock}\n\n${content.slice(index)}`;
}

function summarizeLatexLog(log: string): string {
  if (!log.trim()) return "";
  const lines = log.split(/\r?\n/);
  const important = lines.filter((line) => {
    const item = line.trim();
    return item.startsWith("!") || item.includes("Error") || item.includes("Warning") || item.includes("Undefined");
  });
  if (important.length === 0) return "Compile log summary: no obvious LaTeX error lines found.";
  return ["Compile log summary:", ...important.slice(0, 8)].join("\n");
}
