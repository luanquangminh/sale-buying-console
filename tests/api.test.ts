import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "http://console.test/api";

async function login(username = "admin", password = "changeme") {
  const res = await SELF.fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { res, cookie };
}

const call = (cookie: string, path: string, init: RequestInit = {}) =>
  SELF.fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers as Record<string, string> | undefined) } });

const post = (cookie: string, path: string, body: unknown) => call(cookie, path, { method: "POST", body: JSON.stringify(body) });

describe("auth", () => {
  it("rejects a wrong password", async () => {
    const { res } = await login("admin", "nope");
    expect(res.status).toBe(401);
  });

  it("signs in the seeded admin and reports the session", async () => {
    const { res, cookie } = await login();
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/^sid=/);
    const me = await call(cookie, "/auth/me");
    expect(await me.json()).toMatchObject({ ok: true, user: { id: "admin-01", role: "admin", name: "Administrator" } });
  });

  it("requires a session for state and sync", async () => {
    expect((await SELF.fetch(`${BASE}/state`)).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/sync`, { method: "POST" })).status).toBe(401);
  });

  it("logs out", async () => {
    const { cookie } = await login();
    expect((await post(cookie, "/auth/logout", {})).status).toBe(200);
    expect((await call(cookie, "/auth/me")).status).toBe(401);
  });
});

describe("sync", () => {
  it("round-trips records, keeps newest-first order, and bumps the version", async () => {
    const { cookie } = await login();
    const v0 = (await (await call(cookie, "/state/version")).json()).version;
    const changes = [
      { kind: "pfis", id: "pfi-1700000000000-aaaaaa", saleId: "sale-1", createdAt: "2026-09-20T00:00:00.000Z",
        data: { id: "pfi-1700000000000-aaaaaa", saleId: "sale-1", pfiNo: "3200", products: [] } },
      { kind: "pfis", id: "pfi-1700000000001-bbbbbb", saleId: "sale-1", createdAt: "2026-09-20T00:00:05.000Z",
        data: { id: "pfi-1700000000001-bbbbbb", saleId: "sale-1", pfiNo: "3201", products: [] } },
      { kind: "suppliers", id: "sup-1700000000000-cccccc", createdAt: "2026-09-20T00:00:01.000Z",
        data: { id: "sup-1700000000000-cccccc", name: "Acme Foods", note: "" } },
    ];
    const res = await post(cookie, "/sync", { changes });
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(v0 + 1);

    const { slices } = await (await call(cookie, "/state")).json();
    expect(slices.pfisBySale["sale-1"].map((p: any) => p.pfiNo)).toEqual(["3201", "3200"]);
    expect(slices.suppliers[0].name).toBe("Acme Foods");

    await post(cookie, "/sync", { changes: [{ kind: "suppliers", id: "sup-1700000000000-cccccc", deleted: true }] });
    const after = (await (await call(cookie, "/state")).json()).slices;
    expect(after.suppliers).toHaveLength(0);
    expect(after.pfisBySale["sale-1"]).toHaveLength(2);
  });

  it("updates an existing record in place without changing its creation order", async () => {
    const { cookie } = await login();
    const id = "book-1700000000000-dddddd";
    await post(cookie, "/sync", { changes: [{ kind: "bookings", id, createdAt: "2026-09-20T00:00:00.000Z", data: { id, customerName: "", status: "pending" } }] });
    await post(cookie, "/sync", { changes: [{ kind: "bookings", id, createdAt: "2026-09-20T00:00:00.000Z", data: { id, customerName: "Lagos Traders", status: "loaded" } }] });
    const { slices } = await (await call(cookie, "/state")).json();
    expect(slices.bookings).toHaveLength(1);
    expect(slices.bookings[0]).toMatchObject({ customerName: "Lagos Traders", status: "loaded" });
  });

  it("rejects unknown kinds and bad ids", async () => {
    const { cookie } = await login();
    expect((await post(cookie, "/sync", { changes: [{ kind: "nope", id: "x", data: {} }] })).status).toBe(400);
    expect((await post(cookie, "/sync", { changes: [{ kind: "pfis", id: "../etc", data: {} }] })).status).toBe(400);
  });

  it("hides passwords from non-admin roles and lets new accounts sign in", async () => {
    const { cookie: admin } = await login();
    const buyer = { id: "buyer-1700000000000-eeeeee", role: "buyer", name: "Buyer Team", username: "Buyer", password: "pw-buyer-test", createdAt: "2026-09-20T00:00:00.000Z" };
    await post(admin, "/sync", { changes: [{ kind: "accounts", id: buyer.id, createdAt: buyer.createdAt, data: buyer }] });

    const adminState = (await (await call(admin, "/state")).json()).slices;
    expect(adminState.accounts.map((a: any) => a.id)).toEqual(["admin-01", buyer.id]);
    expect(adminState.accounts[1].password).toBe("pw-buyer-test");

    const { res, cookie } = await login("buyer", "pw-buyer-test"); // username match is case-insensitive
    expect(res.status).toBe(200);
    const buyerState = (await (await call(cookie, "/state")).json()).slices;
    expect(buyerState.accounts.every((a: any) => !("password" in a))).toBe(true);
  });
});

describe("files", () => {
  it.skipIf(!("FILES" in env))("stores an upload in R2 and streams it back with its name", async () => {
    const { cookie } = await login();
    const fd = new FormData();
    fd.append("file", new File(["hello packing list"], "PL 3200.txt", { type: "text/plain" }));
    const up = await SELF.fetch(`${BASE}/files`, { method: "POST", headers: { cookie }, body: fd });
    expect(up.status).toBe(200);
    const meta = await up.json();
    expect(meta.url).toMatch(/^\/api\/files\/file-/);

    const down = await SELF.fetch(`http://console.test${meta.url}`, { headers: { cookie } });
    expect(down.status).toBe(200);
    expect(down.headers.get("content-type")).toContain("text/plain");
    expect(down.headers.get("content-disposition")).toContain("PL%203200.txt");
    expect(await down.text()).toBe("hello packing list");
  });

  it("rejects a document request with no text or images", async () => {
    const { cookie } = await login();
    const res = await post(cookie, "/ai/parse-document", { mediaType: "application/pdf", base64: "JVBERi0=" });
    expect(res.status).toBe(400);
  });
});

describe("sprint 2 kinds", () => {
  it("round-trips Mai tasks and buyer jobs for admin", async () => {
    const { cookie } = await login();
    const task = { id: "mai-1700000000000-aaaaaa", task: "Chase COO for PFI 3200", sale: "Rep", supplier: "Yogi Tea GmbH", status: "not_started", createdAt: "2026-09-23T00:00:00.000Z" };
    const job = { id: "job-1700000000000-bbbbbb", givenDate: "2026-09-24", jobs: "Get container quote to Lagos", maiNote: "urgent", status: "pending", notes: [{ id: "jnote-1", text: "Asked Maersk", statusAtTime: "pending", by: "Buyer Team", createdAt: "2026-09-24T10:00:00.000Z" }], createdAt: "2026-09-23T00:00:00.000Z" };
    const res = await post(cookie, "/sync", { changes: [
      { kind: "maiTasks", id: task.id, createdAt: task.createdAt, data: task },
      { kind: "buyerJobs", id: job.id, createdAt: job.createdAt, data: job },
    ] });
    expect(res.status).toBe(200);
    const { slices } = await (await call(cookie, "/state")).json();
    expect(slices.maiTasks).toEqual([task]);
    expect(slices.buyerJobs[0]).toMatchObject({ jobs: "Get container quote to Lagos", notes: [{ text: "Asked Maersk", statusAtTime: "pending" }] });
  });

  it("keeps jobs away from the sale role too", async () => {
    const { cookie: admin } = await login();
    const rep = { id: "sale-1700000000009-hhhhhh", role: "sale", name: "Rep", username: "rep9", password: "pw-sale-test", createdAt: "2026-09-20T00:00:00.000Z" };
    await post(admin, "/sync", { changes: [
      { kind: "accounts", id: rep.id, createdAt: rep.createdAt, data: rep },
      { kind: "buyerJobs", id: "job-1700000000009-iiiiii", data: { id: "job-1700000000009-iiiiii", jobs: "not for reps", status: "pending", notes: [] } },
    ] });
    const { cookie } = await login("rep9", "pw-sale-test");
    const { slices } = await (await call(cookie, "/state")).json();
    expect(slices.buyerJobs).toEqual([]);
    expect(slices.maiTasks).toEqual([]);
    expect((await post(cookie, "/sync", { changes: [{ kind: "buyerJobs", id: "job-1700000000010-jjjjjj", data: { id: "job-1700000000010-jjjjjj", jobs: "x", status: "pending", notes: [] } }] })).status).toBe(403);
  });

  it("keeps Mai's tasks away from other roles but shares jobs with the buyer", async () => {
    const { cookie: admin } = await login();
    const buyer = { id: "buyer-1700000000001-ffffff", role: "buyer", name: "Buyer Two", username: "buyer2", password: "pw-buyer-test", createdAt: "2026-09-20T00:00:00.000Z" };
    await post(admin, "/sync", { changes: [
      { kind: "accounts", id: buyer.id, createdAt: buyer.createdAt, data: buyer },
      { kind: "maiTasks", id: "mai-1700000000001-cccccc", data: { id: "mai-1700000000001-cccccc", task: "private", status: "started" } },
      { kind: "buyerJobs", id: "job-1700000000001-dddddd", data: { id: "job-1700000000001-dddddd", jobs: "shared", status: "pending", notes: [] } },
    ] });
    const { cookie } = await login("buyer2", "pw-buyer-test");
    const { slices } = await (await call(cookie, "/state")).json();
    expect(slices.maiTasks).toEqual([]); // present so the UI slice exists, but empty
    expect(slices.buyerJobs.map((j: any) => j.jobs)).toContain("shared");

    const denied = await post(cookie, "/sync", { changes: [{ kind: "maiTasks", id: "mai-1700000000002-eeeeee", data: { id: "mai-1700000000002-eeeeee", task: "sneaky" } }] });
    expect(denied.status).toBe(403);
    const ok = await post(cookie, "/sync", { changes: [{ kind: "buyerJobs", id: "job-1700000000002-gggggg", data: { id: "job-1700000000002-gggggg", jobs: "from buyer", status: "pending", notes: [] } }] });
    expect(ok.status).toBe(200);
  });
});

describe("role-aware PFI writes", () => {
  const F = "pfi-1700000000100-mmmmmm";
  const line = (extra: Record<string, unknown>) => ({ id: "L1", product: "Tea", quantity: 10, rate: 1, orderStatus: "not_ordered", receivedQuantity: "", ...extra });
  const pfi = (products: unknown[], extra: Record<string, unknown> = {}) => ({ id: F, saleId: "sale-1700000000009-hhhhhh", pfiNo: "7000", products, documents: [], payments: [], delivery: {}, ...extra });
  const write = (cookie: string, data: unknown, viewAs?: string) => post(cookie, "/sync", { changes: [{ kind: "pfis", id: F, saleId: "sale-1700000000009-hhhhhh", data, ...(viewAs ? { viewAs } : {}) }] });
  const stored = async (cookie: string) => (await (await call(cookie, "/state")).json()).slices.pfisBySale["sale-1700000000009-hhhhhh"][0];

  async function setup() {
    const { cookie: admin } = await login();
    const rep = { id: "sale-1700000000009-hhhhhh", role: "sale", name: "Rep", username: "rep9", password: "pw-sale-test", createdAt: "2026-09-20T00:00:00.000Z" };
    const buyer = { id: "buyer-1700000000009-nnnnnn", role: "buyer", name: "Buyer", username: "buyer9", password: "pw-buyer-test", createdAt: "2026-09-20T00:00:00.000Z" };
    await post(admin, "/sync", { changes: [
      { kind: "accounts", id: rep.id, createdAt: rep.createdAt, data: rep },
      { kind: "accounts", id: buyer.id, createdAt: buyer.createdAt, data: buyer },
    ] });
    await write(admin, pfi([line({})]));
    return { admin, sale: (await login("rep9", "pw-sale-test")).cookie, buyer: (await login("buyer9", "pw-buyer-test")).cookie };
  }

  it("a sale's stale write keeps the buyer's newer tracking fields, and vice versa", async () => {
    const { sale, buyer } = await setup();
    await write(buyer, pfi([line({ orderStatus: "ordered", receivedQuantity: 4 })]));
    await write(sale, pfi([line({ product: "Tea (renamed)" })])); // stale copy: still says not_ordered
    let rec = await stored(sale);
    expect(rec.products[0]).toMatchObject({ product: "Tea (renamed)", orderStatus: "ordered", receivedQuantity: 4 });
    await write(buyer, pfi([line({ orderStatus: "received", receivedQuantity: 10 })])); // stale copy: product "Tea"
    rec = await stored(buyer);
    expect(rec.products[0]).toMatchObject({ product: "Tea (renamed)", orderStatus: "received", receivedQuantity: 10 });
  });

  it("the sale's line list, documents and payments win over a buyer's stale copy; buyer keeps document status", async () => {
    const { sale, buyer } = await setup();
    await write(sale, pfi([line({}), line({ id: "L2", product: "Biscuits" })], { documents: [{ id: "d1", type: "COO", status: "not_applied" }], payments: [{ id: "p1", amount: 5 }] }));
    await write(buyer, pfi([line({ orderStatus: "ordered" })], { documents: [{ id: "d1", type: "COO", status: "applied" }], payments: [] }));
    const rec = await stored(sale);
    expect(rec.products.map((p: any) => [p.id, p.orderStatus])).toEqual([["L1", "ordered"], ["L2", "not_ordered"]]);
    expect(rec.documents).toEqual([{ id: "d1", type: "COO", status: "applied" }]);
    expect(rec.payments).toEqual([{ id: "p1", amount: 5 }]);
  });

  it("admin writes merge only when the change says which view made it", async () => {
    const { admin, buyer } = await setup();
    await write(buyer, pfi([line({ orderStatus: "ordered" })]));
    await write(admin, pfi([line({ product: "Tea (admin as sale)" })]), "sale");
    expect((await stored(admin)).products[0]).toMatchObject({ product: "Tea (admin as sale)", orderStatus: "ordered" });
    await write(admin, pfi([line({ product: "Tea (plain admin write)" })]));
    expect((await stored(admin)).products[0]).toMatchObject({ product: "Tea (plain admin write)", orderStatus: "not_ordered" });
  });
});

describe("warehouse role", () => {
  it("sees the calendar and account names only, can write calendar entries, nothing else; MCP refused", async () => {
    const { cookie: admin } = await login();
    const wh = { id: "warehouse-1700000000001-wwwwww", role: "warehouse", name: "Warehouse", username: "wh9", password: "pw-wh-test", createdAt: "2026-09-20T00:00:00.000Z" };
    await post(admin, "/sync", { changes: [
      { kind: "accounts", id: wh.id, createdAt: wh.createdAt, data: wh },
      { kind: "pfis", id: "pfi-1700000000200-pppppp", saleId: "sale-x", data: { id: "pfi-1700000000200-pppppp", saleId: "sale-x", pfiNo: "8000", products: [] } },
      { kind: "warehouseEvents", id: "wh-1700000000001-eeeeee", data: { id: "wh-1700000000001-eeeeee", date: "2026-09-24", title: "Siam PO 2424", type: "collection" } },
    ] });
    const { res, cookie } = await login("wh9", "pw-wh-test");
    expect(res.status).toBe(200);
    const { slices } = await (await call(cookie, "/state")).json();
    expect(slices.warehouseEvents.map((e: any) => e.title)).toEqual(["Siam PO 2424"]);
    expect(slices.accounts.map((a: any) => a.username)).toContain("wh9");
    expect(Object.keys(slices.pfisBySale)).toHaveLength(0);
    expect(slices.pos).toEqual([]);
    expect(slices.maiTasks).toEqual([]);
    expect((await post(cookie, "/sync", { changes: [{ kind: "warehouseEvents", id: "wh-1700000000002-ffffff", data: { id: "wh-1700000000002-ffffff", date: "2026-09-25", title: "Hunt collection", type: "collection" } }] })).status).toBe(200);
    expect((await post(cookie, "/sync", { changes: [{ kind: "pos", id: "po-1700000000001-qqqqqq", data: { id: "po-1700000000001-qqqqqq" } }] })).status).toBe(403);
    const mcp = await SELF.fetch("http://console.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-api-key": "wh9:pw-wh-test" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) });
    expect(mcp.status).toBe(403);
  });
});
