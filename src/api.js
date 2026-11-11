/* Thin fetch wrapper for /api. Every call sends the session cookie. */

import { CHUNK_BYTES, uploadInChunks } from "./upload";

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
  if (body instanceof Blob) {
    init.headers["Content-Type"] = "application/octet-stream";
    init.body = body;
  } else if (body instanceof FormData) {
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

/** The three requests of an upload in parts (see upload.js). */
const chunkTransport = {
  start: (meta) => request("POST", "/files/start", meta),
  part: (id, n, blob) => request("PUT", `/files/${id}/part/${n}`, blob),
  finish: (id, meta) => request("POST", `/files/${id}/finish`, meta),
};

export const api = {
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),
  state: () => request("GET", "/state"),
  version: () => request("GET", "/state/version"),
  sync: (changes, opts) => request("POST", "/sync", { changes }, opts),
  /** A file up to 25 MB: one request when small, parts when not; `onProgress(done, size)` as it goes. */
  uploadFile: (file, onProgress) => {
    if (file.size > CHUNK_BYTES) return uploadInChunks(file, chunkTransport, { onProgress });
    const fd = new FormData();
    fd.append("file", file, file.name);
    return request("POST", "/files", fd).then((res) => { if (onProgress) onProgress(file.size, file.size); return res; });
  },
  parseDocument: (payload) => request("POST", "/ai/parse-document", payload),
};
