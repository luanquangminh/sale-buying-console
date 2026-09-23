import { Hono } from "hono";
import { aiApp } from "./ai";
import { authApp, currentUser } from "./auth";
import { getVersion } from "./db";
import { filesApp } from "./files";
import { mcpApp } from "./mcp/index";
import { buildSnapshot, isKind, kindAllowed } from "./records";
import { applyChanges } from "./sync";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authApp);

// Everything below needs a session.
app.use("*", async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ ok: false, error: "Not signed in" }, 401);
  c.set("user", user);
  await next();
});

app.get("/state", async (c) =>
  c.json({ ok: true, version: await getVersion(c.env.DB), slices: await buildSnapshot(c.env.DB, c.get("user")) }),
);
app.get("/state/version", async (c) => c.json({ ok: true, version: await getVersion(c.env.DB) }));

app.post("/sync", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.changes)) return c.json({ ok: false, error: "Expected { changes: [] }" }, 400);
  const user = c.get("user");
  const denied = body.changes.find((ch: { kind?: unknown }) => isKind(ch.kind) && !kindAllowed(ch.kind, user));
  if (denied) return c.json({ ok: false, error: `${denied.kind} is not available to the ${user.role} role` }, 403);
  try {
    const version = await applyChanges(c.env.DB, body.changes, user);
    return c.json({ ok: true, version });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "Bad request" }, 400);
  }
});

app.route("/files", filesApp);
app.route("/ai", aiApp);

app.notFound((c) => c.json({ ok: false, error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: "Server error" }, 500);
});

const root = new Hono<AppEnv>();
root.route("/mcp", mcpApp);
// MCP clients probe these before deciding on OAuth; a plain 404 says "no OAuth here, use the key" instead of the SPA's index page.
root.all("/.well-known/*", (c) => c.json({ ok: false, error: "Not found" }, 404));
root.route("/", app);

export default root;
