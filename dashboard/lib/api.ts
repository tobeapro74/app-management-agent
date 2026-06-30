export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8888";

export interface AppStatus {
  id: number;
  app_name: string;
  status: "ok" | "warn" | "error";
  response_ms: number | null;
  details: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  checked_at: string;
}

export interface AppMeta {
  name: string;
  base_url: string;
}

export async function fetchStatus(): Promise<AppStatus[]> {
  const res = await fetch(`${API_BASE}/api/status`, { cache: "no-store" });
  if (!res.ok) throw new Error("status fetch failed");
  return res.json();
}

export async function fetchHistory(appName: string, limit = 30): Promise<AppStatus[]> {
  const res = await fetch(
    `${API_BASE}/api/history/${encodeURIComponent(appName)}?limit=${limit}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function fetchApps(): Promise<AppMeta[]> {
  const res = await fetch(`${API_BASE}/api/apps`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function triggerRun(notifySlack = false): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/run?notify_slack=${notifySlack}`, { method: "POST" });
  return res.json();
}
