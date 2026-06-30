/**
 * Centralized API fetch with error handling.
 * Echo's review #2: reduce silent failures across all views.
 */

import { apiUrl } from "./api";

type ApiOptions = RequestInit;

/** Fetch from MAW API with consistent error handling.
 * Auth is the nginx login session (cookie) — no app-level token. */
export async function apiFetch<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const fetchOpts = options;

  const headers: Record<string, string> = {
    ...(fetchOpts.headers as Record<string, string> || {}),
  };

  // Add content-type for POST/PUT
  if (fetchOpts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(apiUrl(path), { ...fetchOpts, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText, path);
  }

  return res.json();
}

/** Typed API error */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`API ${status}: ${body} (${path})`);
    this.name = "ApiError";
  }
}
