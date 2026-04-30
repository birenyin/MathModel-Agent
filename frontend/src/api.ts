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

export async function apiPut<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body
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

export type Upload = {
  id: string;
  workflow_id: string;
  filename: string;
  path: string;
  content_type: string;
  extracted_chars: number;
  created_at: string;
};

export type Settings = {
  model_base_url?: string;
  model_name?: string;
  model_api_key?: string;
  reviewer_base_url?: string;
  reviewer_model_name?: string;
  reviewer_api_key?: string;
  texlive_bin?: string;
};

export type TextPreview = {
  id: string;
  filename?: string;
  text: string;
};

export type Skill = {
  id: string;
  title: string;
  description: string;
  path: string;
};

export type WorkspaceFile = {
  path: string;
  name: string;
  size: number;
  suffix: string;
  text_previewable: boolean;
  embeddable: boolean;
};

export type CodeRunResult = {
  ok: boolean;
  exit_code: number | null;
  timed_out: boolean;
  elapsed_seconds: number;
  stdout: string;
  stderr: string;
  log_path: string;
  artifact: Artifact;
};

export type ModelTestResult = {
  ok: boolean;
  mode: string;
  message: string;
};
