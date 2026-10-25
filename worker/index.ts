import { Hono } from "hono";
import { aiApp } from "./ai";
import { authApp, currentUser } from "./auth";
import { getVersion } from "./db";
import { filesApp } from "./files";
import { mcpApp } from "./mcp/index";
import { buildSnapshot, isKind, kindAllowed, kindWritable, partlyAllowed, recordWritable } from "./records";
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
  const changes = body.changes as Array<{ kind?: unknown; id?: unknown; data?: any; deleted?: boolean }>;
  const denied = changes.find((ch) => isKind(ch.kind) && !kindWritable(ch.kind, user) && !partlyAllowed(ch.kind, user));
  if (denied) return c.json({ ok: false, error: `${denied.kind} is not available to the ${user.role} role` }, 403);
  // a kind reached record by record: the record sent, and the one stored under that id, both have to be the user's
  const partial = changes.filter((ch) => isKind(ch.kind) && !kindWritable(ch.kind, user) && partlyAllowed(ch.kind, user));
  if (partial.length) {
    const stored = await storedOf(c.env.DB, partial.map((ch) => ({ kind: String(ch.kind), id: String(ch.id) })));
    for (const ch of partial) {
      const was = stored.get(`${ch.kind}:${ch.id}`);
      const own = (!was || recordWritable(ch.kind as any, user, was)) && (ch.deleted || recordWritable(ch.kind as any, user, ch.data));
      if (!own) return c.json({ ok: false, error: `${ch.kind}: a ${user.role} may only write what is their own` }, 403);
    }
  }
  const refused = await applyPaymentRules(c.env.DB, changes);
  if (refused) return c.json({ ok: false, error: refused }, 403);
  try {
    const version = await applyChanges(c.env.DB, body.changes, user);
    return c.json({ ok: true, version });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "Bad request" }, 400);
  }
});

const marks = (n: number) => Array(n).fill("?").join(",");

/** The stored copies of these records, by `kind:id`, one query per kind (in chunks of 50). */
async function storedOf(db: D1Database, refs: Array<{ kind: string; id: string }>) {
  const out = new Map<string, any>();
  for (const kind of new Set(refs.map((r) => r.kind))) {
    const ids = refs.filter((r) => r.kind === kind).map((r) => r.id);
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const { results } = await db.prepare(`SELECT id, data FROM records WHERE kind = ? AND id IN (${marks(chunk.length)})`).bind(kind, ...chunk).all<{ id: string; data: string }>();
      for (const r of results) out.set(`${kind}:${r.id}`, JSON.parse(r.data));
    }
  }
  return out;
}

type Change = { kind?: unknown; id?: unknown; data?: any; deleted?: boolean };

/**
 * Payments received, for every role, in one round trip: an expected payment the accountant has confirmed stays as the confirmation
 * found it (undo the confirmation first); a confirmation points at an expected payment that exists and has no other confirmation.
 * Each receipt is stamped with the rep of the expected payment it confirms, so a rep's snapshot can pick its own receipts.
 */
async function applyPaymentRules(db: D1Database, changes: Change[]): Promise<string | null> {
  const touched = changes.filter((ch) => ch.kind === "expectedPayments").map((ch) => String(ch.id));
  const receiptsGoing = new Set(changes.filter((ch) => ch.kind === "receivedPayments" && ch.deleted).map((ch) => String(ch.id)));
  const receipts = changes.filter((ch) => ch.kind === "receivedPayments" && !ch.deleted && ch.data);
  const confirms = receipts.filter((ch) => ch.data.expectedId).map((ch) => ({ id: String(ch.id), expectedId: String(ch.data.expectedId) }));
  if (!touched.length && !receipts.length) return null;
  const expectedIds = confirms.map((x) => x.expectedId);
  const stmts: D1PreparedStatement[] = [];
  if (touched.length) stmts.push(db.prepare(`SELECT id FROM records WHERE kind = 'receivedPayments' AND json_extract(data, '$.expectedId') IN (${marks(touched.length)})`).bind(...touched));
  if (expectedIds.length) stmts.push(db.prepare(`SELECT kind, id, json_extract(data, '$.expectedId') AS expectedId, json_extract(data, '$.saleId') AS saleId FROM records WHERE (kind = 'expectedPayments' AND id IN (${marks(expectedIds.length)})) OR (kind = 'receivedPayments' AND json_extract(data, '$.expectedId') IN (${marks(expectedIds.length)}))`).bind(...expectedIds, ...expectedIds));
  const results = stmts.length ? await db.batch<{ kind: string; id: string; expectedId: string | null; saleId: string | null }>(stmts) : [];
  // locked while a confirmation points at it, unless that confirmation goes in the same batch (the accountant deleting the row whole)
  if (touched.length && results[0].results.some((r) => !receiptsGoing.has(r.id))) return "expectedPayments: this payment has been confirmed by the accountant and can no longer be changed; undo the confirmation first";
  const rows = expectedIds.length ? results[touched.length ? 1 : 0].results : [];
  const repOf = new Map(rows.filter((r) => r.kind === "expectedPayments").map((r) => [r.id, r.saleId || ""]));
  if (confirms.some((x) => !repOf.has(x.expectedId))) return "receivedPayments: the expected payment this confirms no longer exists";
  const confirmedBy = new Map<string, Set<string>>(); // expected id → the receipts pointing at it, stored and in this batch
  for (const r of [...rows.filter((r) => r.kind === "receivedPayments").map((r) => ({ id: r.id, expectedId: String(r.expectedId) })), ...confirms]) {
    const ids = confirmedBy.get(r.expectedId) ?? new Set<string>(); ids.add(r.id); confirmedBy.set(r.expectedId, ids);
  }
  if ([...confirmedBy.values()].some((ids) => ids.size > 1)) return "receivedPayments: that expected payment has already been confirmed";
  for (const ch of receipts) ch.data.saleId = ch.data.expectedId ? repOf.get(String(ch.data.expectedId)) || "" : "";
  return null;
}

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
