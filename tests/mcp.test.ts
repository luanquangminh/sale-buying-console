import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const URL_ = "http://console.test/mcp";
const KEY = "admin:changeme";

async function rpc(method: string, params: Record<string, unknown> = {}, key: string | null = KEY, id = 1) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (key) headers["x-api-key"] = key;
  const res = await SELF.fetch(URL_, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* SSE or empty */ }
  return { status: res.status, json, text };
}
const toolResult = (r: any) => JSON.parse(r.json.result.content[0].text);

describe("MCP endpoint", () => {
  it("serves a help page to browsers and rejects unauthenticated JSON-RPC", async () => {
    const page = await SELF.fetch(URL_);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Add custom connector");
    const r = await rpc("tools/list", {}, null);
    expect(r.status).toBe(401);
    expect(r.json.error.message).toMatch(/Unauthorized/);
  });

  it("answers OAuth discovery probes with a plain 404 (the key in the URL or header is the whole auth)", async () => {
    for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource", "/.well-known/openid-configuration"]) {
      const r = await SELF.fetch(`http://console.test${path}`);
      expect(r.status).toBe(404);
      expect(r.headers.get("content-type")).toContain("application/json");
    }
  });

  it("accepts the key as a query parameter and as a bearer token", async () => {
    const q = await SELF.fetch(`${URL_}?key=${encodeURIComponent(KEY)}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    expect(q.status).toBe(200);
    const b = await SELF.fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${KEY}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    expect(b.status).toBe(200);
  });

  it("initializes and lists the tools", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe("sale-buying-console");
    const list = await rpc("tools/list");
    const names = list.json.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(["add_job", "add_job_note", "add_pfi_lines", "add_po_lines", "add_task", "add_warehouse_event", "create_pfi", "get_pfi", "get_po", "list_customers", "list_jobs", "list_pfis", "list_pos", "list_tasks", "list_warehouse_events"]);
  });

  it("creates a PFI, appends validated lines, and reads them back; the version counter moves", async () => {
    await rpc("tools/call", { name: "create_pfi", arguments: { pfiNo: "0", customerName: "x" } }); // digits-only guard path exercised below
    const sale = { id: "sale-1700000000000-mcp001", role: "sale", name: "Rep One", username: "rep1", password: "pw-sale-test", createdAt: "2026-09-20T00:00:00.000Z" };
    const seed = await SELF.fetch("http://console.test/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "changeme" }) });
    const cookie = seed.headers.get("set-cookie")?.split(";")[0] ?? "";
    await SELF.fetch("http://console.test/api/sync", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ changes: [{ kind: "accounts", id: sale.id, createdAt: sale.createdAt, data: sale }] }) });

    const created = await rpc("tools/call", { name: "create_pfi", arguments: { pfiNo: "3300", customerName: "Acme Foods Ltd", currency: "GBP", saleRep: "rep1" } });
    expect(toolResult(created)).toMatchObject({ ok: true, pfiNo: "3300", saleRep: "Rep One" });

    const added = await rpc("tools/call", { name: "add_pfi_lines", arguments: { pfiNo: "3300", lines: [
      { product: "Yogi Tea Organic Bags Classic Chai 37.4g", ean: "4012824406711", pack: "6 x 17s", bbd: "02/2027", quantity: 20, rate: 9.02, vat: "0.0% Z" },
      { product: "Subtotal", quantity: 0, rate: 180.4 },
      { product: "Heinz Baked Beans 415g", ean: "5000157024672", quantity: 30, rate: 14.4, vat: "20%" },
    ] } });
    const addRes = toolResult(added);
    expect(addRes).toMatchObject({ ok: true, added: 2, totalLines: 2 });
    expect(addRes.warnings.join(" ")).toMatch(/Subtotal/);
    expect(addRes.warnings.join(" ")).toMatch(/5000157024672/);

    const got = toolResult(await rpc("tools/call", { name: "get_pfi", arguments: { pfiNo: "3300" } }));
    expect(got.lines).toHaveLength(2);
    expect(got.lines[0]).toMatchObject({ product: "Yogi Tea Organic Bags Classic Chai 37.4g", ean: "4012824406711", quantity: 20, rate: 9.02, amount: 180.4 });
    expect(got.lines[1].vat).toBe("20.0% S");

    // the sale rep sees it through their own key; the UI snapshot has the feed item
    const mine = toolResult(await rpc("tools/call", { name: "list_pfis", arguments: {} }, "rep1:pw-sale-test"));
    expect(mine.map((p: any) => p.pfiNo)).toContain("3300");
    const state = await (await SELF.fetch("http://console.test/api/state", { headers: { cookie } })).json() as any;
    expect(state.slices.feedBuyerPfi.some((f: any) => /via Claude/.test(f.message))).toBe(true);
    expect(state.version).toBeGreaterThan(0);
  });

  it("scopes a sale rep to their own PFIs and blocks PO tools", async () => {
    const seed = await SELF.fetch("http://console.test/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "changeme" }) });
    const cookie = seed.headers.get("set-cookie")?.split(";")[0] ?? "";
    const reps = [
      { id: "sale-1700000000001-mcp002", role: "sale", name: "Minh Tran", username: "minh", password: "pw-sale-test", createdAt: "2026-09-20T00:00:01.000Z" },
      { id: "sale-1700000000002-mcp003", role: "sale", name: "Linh Nguyen", username: "linh", password: "pw-sale-test", createdAt: "2026-09-20T00:00:02.000Z" },
    ];
    await SELF.fetch("http://console.test/api/sync", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ changes: reps.map((r) => ({ kind: "accounts", id: r.id, createdAt: r.createdAt, data: r })) }) });
    await rpc("tools/call", { name: "create_pfi", arguments: { pfiNo: "4101", customerName: "Minh Customer" } }, "minh:pw-sale-test");
    await rpc("tools/call", { name: "create_pfi", arguments: { pfiNo: "4102", customerName: "Linh Customer" } }, "linh:pw-sale-test");
    const minh = toolResult(await rpc("tools/call", { name: "list_pfis", arguments: {} }, "minh:pw-sale-test"));
    expect(minh.map((p: any) => p.pfiNo)).toEqual(["4101"]);
    const other = await rpc("tools/call", { name: "get_pfi", arguments: { pfiNo: "4102" } }, "minh:pw-sale-test");
    expect(other.json.result.isError).toBe(true);
    const pos = await rpc("tools/call", { name: "list_pos", arguments: {} }, "minh:pw-sale-test");
    // PO tools are not registered for a sale rep at all, so the call is refused as an unknown tool
    const refused = (pos.json.error && /not found|unknown/i.test(pos.json.error.message)) || (pos.json.result && pos.json.result.isError);
    expect(refused).toBeTruthy();
    const all = toolResult(await rpc("tools/call", { name: "list_pfis", arguments: {} }));
    expect(all.map((p: any) => p.pfiNo).sort()).toEqual(expect.arrayContaining(["4101", "4102"]));
  });
});

describe("MCP tools for the extension tabs", () => {
  async function seedAccounts() {
    const seed = await SELF.fetch("http://console.test/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "changeme" }) });
    const cookie = seed.headers.get("set-cookie")?.split(";")[0] ?? "";
    const rep = { id: "sale-1700000000000-mcp002", role: "sale", name: "Rep", username: "rep", password: "pw-sale-test", createdAt: "2026-09-20T00:00:00.000Z" };
    const buyer = { id: "buyer-1700000000000-mcp003", role: "buyer", name: "Buyer Team", username: "buyerx", password: "pw-buyer-test", createdAt: "2026-09-20T00:00:00.000Z" };
    await SELF.fetch("http://console.test/api/sync", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ changes: [
      { kind: "accounts", id: rep.id, createdAt: rep.createdAt, data: rep }, { kind: "accounts", id: buyer.id, createdAt: buyer.createdAt, data: buyer },
    ] }) });
  }

  it("admin adds and lists a Mai task; a sale rep is refused", async () => {
    await seedAccounts();
    const added = await rpc("tools/call", { name: "add_task", arguments: { task: "Chase COO for PFI 3200", sale: "Rep", supplier: "Yogi Tea" } });
    expect(toolResult(added)).toMatchObject({ ok: true, status: "not_started" });
    const list = toolResult(await rpc("tools/call", { name: "list_tasks", arguments: {} }));
    expect(list.map((t: any) => t.task)).toEqual(["Chase COO for PFI 3200"]);
    const repTools = (await rpc("tools/list", {}, "rep:pw-sale-test")).json.result.tools.map((t: any) => t.name).sort();
    expect(repTools).toEqual(["add_pfi_lines", "create_pfi", "get_pfi", "list_customers", "list_pfis"]); // a rep is not offered tools it cannot use
    const buyerTools = (await rpc("tools/list", {}, "buyerx:pw-buyer-test")).json.result.tools.map((t: any) => t.name);
    expect(buyerTools).toHaveLength(13);
    expect(buyerTools).not.toContain("add_task");
  });

  it("buyer adds a job, a note stamped with the status, then a calendar entry from a dd/mm/yyyy date", async () => {
    await seedAccounts();
    const key = "buyerx:pw-buyer-test";
    expect(toolResult(await rpc("tools/call", { name: "add_job", arguments: { jobs: "Get a container quote to Lagos", maiNote: "urgent", givenDate: "24/09/2026" } }, key))).toMatchObject({ ok: true, givenDate: "2026-09-24", status: "pending" });
    expect(toolResult(await rpc("tools/call", { name: "add_job_note", arguments: { jobs: "container quote", text: "Asked Maersk", status: "in_process" } }, key))).toMatchObject({ ok: true, notes: 1, status: "in_process" });
    const jobs = toolResult(await rpc("tools/call", { name: "list_jobs", arguments: {} }, key));
    expect(jobs[0].notes[0]).toMatchObject({ by: "Buyer Team", status: "pending", text: "Asked Maersk" });
    expect(toolResult(await rpc("tools/call", { name: "add_warehouse_event", arguments: { date: "25/09/2026", title: "Siam PO 2424", type: "collection", refNo: "2424" } }, key))).toMatchObject({ ok: true, date: "2026-09-25" });
    const events = toolResult(await rpc("tools/call", { name: "list_warehouse_events", arguments: { month: "2026-09" } }, key));
    expect(events).toEqual([{ date: "2026-09-25", title: "Siam PO 2424", type: "collection", refNo: "2424", note: "", by: "Buyer Team" }]);
    const bad = await rpc("tools/call", { name: "add_warehouse_event", arguments: { date: "31/02/2026", title: "x" } }, key);
    expect(bad.json.result.isError).toBe(true);
  });
});
