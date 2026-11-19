import type {
  AnalysisResponse,
  HealthResponse,
  RubricsResponse,
} from "./types";

const RAW_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const API_BASE_URL = RAW_API_URL.replace(/\/+$/, "");

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown; message?: unknown };
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (typeof data.message === "string") return data.message;
  } catch {
    // Ignore JSON parse errors and fall back to status text
  }
  return `Request failed with status ${res.status} (${res.statusText || "Error"})`;
}

export async function fetchHealth(
  signal?: AbortSignal
): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchRubrics(
  signal?: AbortSignal
): Promise<RubricsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/rubrics`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as RubricsResponse;
}

export interface AnalyzePresentationParams {
  audio: Blob;
  filename: string;
  rubricId: string;
  topic?: string;
  targetMinSec?: number | null;
  targetMaxSec?: number | null;
  signal?: AbortSignal;
}

export async function analyzePresentation(
  params: AnalyzePresentationParams
): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("audio", params.audio, params.filename);
  formData.append("rubric_id", params.rubricId);

  if (params.topic && params.topic.trim().length > 0) {
    formData.append("topic", params.topic.trim());
  }
  if (
    typeof params.targetMinSec === "number" &&
    Number.isFinite(params.targetMinSec) &&
    params.targetMinSec > 0
  ) {
    formData.append("target_min_sec", String(Math.round(params.targetMinSec)));
  }
  if (
    typeof params.targetMaxSec === "number" &&
    Number.isFinite(params.targetMaxSec) &&
    params.targetMaxSec > 0
  ) {
    formData.append("target_max_sec", String(Math.round(params.targetMaxSec)));
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/analyze`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  return (await res.json()) as AnalysisResponse;
}
