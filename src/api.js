/* Thin fetch wrapper for /api. Every call sends the session cookie. */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(method, path, body, opts = {}) {
  const init = { method, credentials: "same-origin", headers: {} };
  if (opts.keepalive) init.keepalive = true; // survives the page closing (body must stay under 64 KB)
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) throw new ApiError(res.status, (json && json.error) || res.statusText || "Request failed");
  return json;
}

export const api = {
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),
  state: () => request("GET", "/state"),
  version: () => request("GET", "/state/version"),
  sync: (changes, opts) => request("POST", "/sync", { changes }, opts),
  uploadFile: (file) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return request("POST", "/files", fd);
  },
  parseDocument: (payload) => request("POST", "/ai/parse-document", payload),
};
