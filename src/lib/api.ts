export class ApiError extends Error {
  status: number;
  details: Array<{ path: string; message: string }>;
  constructor(message: string, status: number, details: Array<{ path: string; message: string }> = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|; )vms_admin_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { "x-vms-app": "admin" };
  if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrfToken();
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const send = () => {
    if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrfToken();
    return fetch(`/api/v1${path}`, { method, headers, body, credentials: "include" });
  };
  let response = await send();
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const refresh = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": csrfToken(), "x-vms-app": "admin" },
    });
    if (refresh.ok) response = await send();
  }

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message ?? "Request failed";
    const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
    throw new ApiError(message, response.status, details);
  }
  return payload as T;
}

export async function download(path: string, filename: string) {
  const response = await fetch(`/api/v1${path}`, { credentials: "include", headers: { "x-vms-app": "admin" } });
  if (!response.ok) throw new ApiError("Export failed", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
