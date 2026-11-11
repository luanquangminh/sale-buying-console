import { Hono } from "hono";
import type { Context } from "hono";
import { nowIso } from "./db";
import type { AppEnv } from "./types";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PART_BYTES = 2 * 1024 * 1024;
const MAX_PARTS = 64;
const ID_RE = /^file-[a-z0-9]+-[a-z0-9]+$/;

export const filesApp = new Hono<AppEnv>();

const NO_R2 = { ok: false, error: "File storage (R2) is not enabled on this deployment yet" };
const TOO_LARGE = { ok: false, error: "File is larger than 25 MB" };

const newId = () => `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const safeNameOf = (name: string) => (name || "file").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120) || "file";
const partKey = (id: string, n: number) => `files/${id}/part-${n}`;

/** Puts the bytes in R2 under the file's id and records the file; the answer the client keeps (name and url). */
async function store(c: Context<AppEnv>, id: string, fileName: string, contentType: string, body: File | Uint8Array, size: number) {
  const name = fileName || "file";
  const key = `files/${id}/${safeNameOf(name)}`;
  const type = contentType || "application/octet-stream";
  await c.env.FILES.put(key, body, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(
    "INSERT INTO files (id, r2_key, file_name, content_type, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, key, name, type, size, c.get("user").id, nowIso())
    .run();
  return { ok: true, id, fileName: name, url: `/api/files/${id}` };
}

/* A small file comes in one request. */
filesApp.post("/", async (c) => {
  if (!c.env.FILES) return c.json(NO_R2, 503);
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ ok: false, error: "No file in the request" }, 400);
  if (file.size > MAX_BYTES) return c.json(TOO_LARGE, 413);
  return c.json(await store(c, newId(), file.name, file.type, file, file.size));
});

/* A file on a slow line comes in parts, one short request each (see src/upload.js): start, the parts, finish — which joins them. */
filesApp.post("/start", async (c) => {
  if (!c.env.FILES) return c.json(NO_R2, 503);
  const meta = (await c.req.json().catch(() => null)) as { size?: unknown } | null;
  const size = Number(meta && meta.size);
  if (!Number.isFinite(size) || size <= 0) return c.json({ ok: false, error: "The file size is missing" }, 400);
  if (size > MAX_BYTES) return c.json(TOO_LARGE, 413);
  return c.json({ ok: true, id: newId() });
});

filesApp.put("/:id/part/:n", async (c) => {
  if (!c.env.FILES) return c.json(NO_R2, 503);
  const id = c.req.param("id");
  const n = Number(c.req.param("n"));
  if (!ID_RE.test(id)) return c.json({ ok: false, error: "Unknown upload" }, 400);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARTS) return c.json({ ok: false, error: `Part number must be 1 to ${MAX_PARTS}` }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ ok: false, error: "The part is empty" }, 400);
  if (bytes.byteLength > MAX_PART_BYTES) return c.json({ ok: false, error: "A part is larger than 2 MB" }, 413);
  await c.env.FILES.put(partKey(id, n), bytes);
  return c.json({ ok: true, size: bytes.byteLength });
});

filesApp.post("/:id/finish", async (c) => {
  if (!c.env.FILES) return c.json(NO_R2, 503);
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ ok: false, error: "Unknown upload" }, 400);
  if (await c.env.DB.prepare("SELECT 1 FROM files WHERE id = ?").bind(id).first()) return c.json({ ok: false, error: "That file is stored already" }, 409);
  const meta = (await c.req.json().catch(() => null)) as { fileName?: unknown; contentType?: unknown; parts?: unknown } | null;
  const parts = Number(meta && meta.parts);
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return c.json({ ok: false, error: `Parts must be 1 to ${MAX_PARTS}` }, 400);
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  for (let n = 1; n <= parts; n++) {
    const obj = await c.env.FILES.get(partKey(id, n));
    if (!obj) return c.json({ ok: false, error: `Part ${n} of ${parts} never arrived; please upload the file again` }, 400);
    const buf = await obj.arrayBuffer();
    total += buf.byteLength;
    if (total > MAX_BYTES) return c.json(TOO_LARGE, 413);
    chunks.push(buf);
  }
  const whole = new Uint8Array(total);
  let at = 0;
  for (const buf of chunks) { whole.set(new Uint8Array(buf), at); at += buf.byteLength; }
  const out = await store(c, id, String((meta && meta.fileName) || ""), String((meta && meta.contentType) || ""), whole, total);
  await c.env.FILES.delete(Array.from({ length: parts }, (_, i) => partKey(id, i + 1)));
  return c.json(out);
});

filesApp.get("/:id", async (c) => {
  if (!c.env.FILES) return c.json(NO_R2, 503);
  const row = await c.env.DB.prepare("SELECT r2_key, file_name FROM files WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string; file_name: string }>();
  if (!row) return c.json({ ok: false, error: "File not found" }, 404);
  const obj = await c.env.FILES.get(row.r2_key);
  if (!obj) return c.json({ ok: false, error: "File not found" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
  return new Response(obj.body, { headers });
});
