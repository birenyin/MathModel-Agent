declare global {
  interface Window {
    mathModelAgent?: { apiBase: string };
  }
}

export const API_BASE = window.mathModelAgent?.apiBase ?? "http://127.0.0.1:18089";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export type Workflow = {
  id: string;
  kind: string;
  preset: string;
  title: string;
  status: string;
  workspace: string;
  current_step?: string;
  steps: Array<{
    id: string;
    title: string;
    status: string;
    checkpoint: boolean;
    artifact_path?: string | null;
  }>;
};

export type EventItem = {
  id: string;
  workflow_id: string;
  level: string;
  message: string;
  created_at: string;
};

export type Artifact = {
  id: string;
  workflow_id: string;
  step_id: string;
  title: string;
  path: string;
  kind: string;
};

