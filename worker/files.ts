import { Hono } from "hono";
import { nowIso } from "./db";
import type { AppEnv } from "./types";

const MAX_BYTES = 25 * 1024 * 1024;

export const filesApp = new Hono<AppEnv>();

const NO_R2 = { ok: false, error: "File storage (R2) is not enabled on this deployment yet" };

filesApp.post("/", async (c) => {
  if (!c.env.FILES) return c.json(NO_R2, 503);
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ ok: false, error: "No file in the request" }, 400);
  if (file.size > MAX_BYTES) return c.json({ ok: false, error: "File is larger than 25 MB" }, 413);

  const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeName = (file.name || "file").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120) || "file";
  const key = `files/${id}/${safeName}`;
  const contentType = file.type || "application/octet-stream";

  await c.env.FILES.put(key, file, { httpMetadata: { contentType } });
  await c.env.DB.prepare(
    "INSERT INTO files (id, r2_key, file_name, content_type, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, key, file.name || safeName, contentType, file.size, c.get("user").id, nowIso())
    .run();

  return c.json({ ok: true, id, fileName: file.name || safeName, url: `/api/files/${id}` });
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
