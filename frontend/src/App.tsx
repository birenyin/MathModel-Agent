import { useEffect, useMemo, useState } from "react";
import { API_BASE, Artifact, EventItem, Workflow, apiGet, apiPost } from "./api";

const presets = [
  ["cumcm", "CUMCM"],
  ["huawei", "Huawei Cup"],
  ["mathorcup", "MathorCup"],
  ["mcm", "MCM/ICM"],
  ["stats", "Statistics Modeling"]
];

export function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
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
    const [ev, ar] = await Promise.all([
      apiGet<EventItem[]>(`/api/workflows/${workflowId}/events`),
      apiGet<Artifact[]>(`/api/workflows/${workflowId}/artifacts`)
    ]);
    setEvents(ev);
    setArtifacts(ar);
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!selected?.id) return;
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
      title,
      problem_text: problemText,
      requirements,
      language: "zh",
      coding_tool: "python"
    });
    setSelectedId(item.id);
    await refresh();
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">M</div>
          <div>
            <h1>MathModel-Agent</h1>
            <p>Desktop workflow agent</p>
          </div>
        </div>

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
      </aside>

      <main className="main">
        {error && <div className="error">{error}</div>}
        {selected ? (
          <>
            <section className="header">
              <div>
                <p className="eyebrow">{selected.kind} / {selected.preset}</p>
                <h2>{selected.title}</h2>
                <p className="workspace">{selected.workspace}</p>
              </div>
              <div className="actions">
                <button onClick={startWorkflow}>Start</button>
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
                        <small>{step.status}{step.checkpoint ? " / checkpoint" : ""}</small>
                      </div>
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

            <section className="panel artifacts">
              <h3>Artifacts</h3>
              {artifacts.length === 0 ? (
                <p className="muted">No artifacts yet.</p>
              ) : (
                <div className="artifact-list">
                  {artifacts.map((artifact) => (
                    <a key={artifact.id} href={`${API_BASE}/api/artifacts/${artifact.id}/file`} target="_blank">
                      <strong>{artifact.title}</strong>
                      <span>{artifact.kind}</span>
                      <small>{artifact.path}</small>
                    </a>
                  ))}
                </div>
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

