import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalise } from "../ai/validate";
import type { Bindings, User } from "../types";
import { commit, findByNumber, makeLine, nowIso, rowsOfKind, scopeSaleId, uid, upsert } from "./data";
import { kindAllowed } from "../records";
import { parseDmy } from "../../src/dates.js";

const LineInput = z.object({
  product: z.string().describe("Product / service name"),
  ean: z.string().optional().describe("EAN-13 / GTIN digits"),
  caseBarcode: z.string().optional().describe("Case (outer) barcode digits"),
  pack: z.string().optional().describe("Pack / case size, e.g. '6 x 17s'"),
  bbd: z.string().optional().describe("Best-before date as printed"),
  quantity: z.number().optional().describe("Cases"),
  rate: z.number().optional().describe("Unit rate, plain number"),
  vat: z.string().optional().describe("VAT text such as '0.0% Z', '5.0%', '20.0% S'"),
});

const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg: string) => ({ isError: true, content: [{ type: "text" as const, text: msg }] });

/** Build an MCP server whose tools act as the authenticated app user. */
export function buildServer(env: Bindings, user: User): McpServer {
  const db = env.DB;
  const server = new McpServer({ name: "sale-buying-console", version: "1.0.0" });

  server.tool("list_customers", "Customers visible to you (a sale rep sees their own).", {}, async () => {
    const rows = await rowsOfKind(db, "customers", scopeSaleId(user));
    const reps = new Map((await rowsOfKind(db, "accounts")).map((a) => [a.id, a.data.name]));
    return text(rows.map((r) => ({ companyName: r.data.companyName, groupChatName: r.data.groupChatName, saleRep: reps.get(r.sale_id || "") || "", notes: (r.data.notes || []).length })));
  });

  server.tool("list_pfis", "PFIs (proforma invoices to customers) with line counts and totals.", { customer: z.string().optional().describe("Filter by customer name (contains)") }, async ({ customer }) => {
    const rows = await rowsOfKind(db, "pfis", scopeSaleId(user));
    const out = rows
      .filter((r) => !customer || String(r.data.customerName || "").toLowerCase().includes(customer.toLowerCase()))
      .map((r) => ({ pfiNo: r.data.pfiNo, customerName: r.data.customerName, saleRep: r.data.saleName, currency: r.data.currency, incoterm: r.data.incoterm, lines: (r.data.products || []).length, total: (r.data.products || []).reduce((a: number, p: any) => a + (Number(p.amount) || 0), 0), createdAt: r.data.createdAt }));
    return text(out);
  });

  server.tool("get_pfi", "One PFI with its product lines, delivery and payments.", { pfiNo: z.string().describe("PFI number, e.g. 3200") }, async ({ pfiNo }) => {
    const row = await findByNumber(db, "pfis", "pfiNo", pfiNo);
    if (!row || (scopeSaleId(user) && row.sale_id !== user.id)) return fail(`PFI ${pfiNo} not found`);
    const d = row.data;
    return text({ pfiNo: d.pfiNo, customerName: d.customerName, saleRep: d.saleName, currency: d.currency, incoterm: d.incoterm, paymentTerm: d.paymentTerm, delivery: d.delivery, payments: d.payments,
      lines: (d.products || []).map((p: any) => ({ product: p.product, ean: p.ean, caseBarcode: p.caseBarcode, pack: p.caseSize, bbd: p.bbd, quantity: p.quantity, rate: p.rate, vat: p.vat, amount: p.amount, orderStatus: p.orderStatus })) });
  });

  server.tool("create_pfi", "Create a PFI for a customer (the customer is created if it does not exist yet). Sale reps create their own; admin must name the sale rep.", {
    pfiNo: z.string().describe("New PFI number, digits only"),
    customerName: z.string(),
    currency: z.enum(["USD", "GBP", "EUR"]).default("USD"),
    incoterm: z.enum(["ex-work", "delivered"]).default("ex-work"),
    paymentTerm: z.string().optional(),
    saleRep: z.string().optional().describe("Sale rep username or name (admin only)"),
  }, async ({ pfiNo, customerName, currency, incoterm, paymentTerm, saleRep }) => {
    if (!/^\d+$/.test(pfiNo)) return fail("pfiNo must be digits only");
    if (await findByNumber(db, "pfis", "pfiNo", pfiNo)) return fail(`PFI ${pfiNo} already exists`);
    let rep: { id: string; name: string } | null = user.role === "sale" ? { id: user.id, name: user.name } : null;
    if (!rep) {
      const accounts = await rowsOfKind(db, "accounts");
      const m = accounts.find((a) => a.data.role === "sale" && saleRep && [a.data.username, a.data.name].some((v) => String(v).toLowerCase() === saleRep.toLowerCase()));
      if (!m) return fail("saleRep is required for admin/buyer and must match a sale account (username or name)");
      rep = { id: m.id, name: m.data.name };
    }
    const changes = [];
    const customers = await rowsOfKind(db, "customers", rep.id);
    let cust = customers.find((c) => String(c.data.companyName).toLowerCase() === customerName.toLowerCase());
    if (!cust) {
      const data = { id: uid("cust"), companyName: customerName, groupChatName: "", productsUsual: "", createdAt: nowIso(), notes: [] };
      cust = { id: data.id, sale_id: rep.id, created_at: data.createdAt, data };
      changes.push(upsert("customers", data.id, data, rep.id));
    }
    const pfi = { id: uid("pfi"), saleId: rep.id, saleName: rep.name, pfiNo, customerId: cust.id, customerName: cust.data.companyName, currency, paymentTerm: paymentTerm || "", incoterm, createdAt: nowIso(),
      products: [], delivery: { type: "delivery", bookedStatus: "not_booked", vehicleType: "container", subType: "20ft Dry", loadingDate: "", loadingTime: "", collectionDate: "", collectionTime: "", etd: "", eta: "" }, documents: [], payments: [] };
    changes.push(upsert("pfis", pfi.id, pfi, rep.id));
    const feed = { id: uid("bfeed"), pfiId: pfi.id, saleId: rep.id, saleName: rep.name, customerName: pfi.customerName, message: `Created PFI ${pfiNo} — track order status once products are added.`, createdAt: nowIso(), seenByBuyer: false };
    changes.push(upsert("feedBuyerPfi", feed.id, feed, rep.id));
    await commit(db, changes, user);
    return text({ ok: true, pfiNo, customerName: pfi.customerName, saleRep: rep.name });
  });

  server.tool("add_pfi_lines", "Append product lines to a PFI. Read the customer's proforma / order document yourself (PDF, photo or pasted text), then call this once with every line: product, ean, caseBarcode, pack, bbd, quantity, rate, vat as printed. Subtotal/total rows are dropped and barcodes are check-digit validated.", {
    pfiNo: z.string(), lines: z.array(LineInput).min(1),
  }, async ({ pfiNo, lines }) => {
    const row = await findByNumber(db, "pfis", "pfiNo", pfiNo);
    if (!row || (scopeSaleId(user) && row.sale_id !== user.id)) return fail(`PFI ${pfiNo} not found`);
    const { parsed, warnings } = normalise({ lines });
    if (!parsed.lines.length) return fail("No usable lines (each needs a product name)");
    const products = [...(row.data.products || []).map(({ receipts, ...rest }: any) => rest), ...parsed.lines.map((l) => makeLine(l))];
    const data = { ...row.data, products };
    const feed = { id: uid("bfeed"), pfiId: row.id, saleId: row.sale_id, saleName: row.data.saleName, customerName: row.data.customerName, message: `Sale saved ${row.data.pfiNo ? `PFI ${row.data.pfiNo}` : "PFI"}: ${parsed.lines.length} line(s) added via Claude.`, createdAt: nowIso(), seenByBuyer: false };
    await commit(db, [upsert("pfis", row.id, data, row.sale_id), upsert("feedBuyerPfi", feed.id, feed, row.sale_id)], user);
    return text({ ok: true, pfiNo, added: parsed.lines.length, totalLines: products.length, warnings });
  });

  if (user.role !== "sale") {
  server.tool("list_pos", "Purchase orders to suppliers.", {}, async () => {
    if (user.role === "sale") return fail("POs are visible to buyer and admin only");
    const rows = await rowsOfKind(db, "pos");
    return text(rows.map((r) => ({ poNo: r.data.poNo, supplierName: r.data.supplierName, currency: r.data.currency, lines: (r.data.products || []).length, sentStatus: r.data.sentStatus, receivedStatus: r.data.receivedStatus })));
  });

  server.tool("get_po", "One PO with its lines and linked PFIs.", { poNo: z.string() }, async ({ poNo }) => {
    if (user.role === "sale") return fail("POs are visible to buyer and admin only");
    const row = await findByNumber(db, "pos", "poNo", poNo);
    if (!row) return fail(`PO ${poNo} not found`);
    const d = row.data;
    return text({ poNo: d.poNo, supplierName: d.supplierName, currency: d.currency, incoterm: d.incoterm, sentStatus: d.sentStatus, receivedStatus: d.receivedStatus,
      lines: (d.products || []).map((p: any) => ({ product: p.product, ean: p.ean, caseBarcode: p.caseBarcode, pack: p.caseSize, bbd: p.bbd, quantity: p.quantity, rate: p.rate, vat: p.vat, amount: p.amount, orderStatus: p.orderStatus, linkedPfis: (p.linkedPfiRefs || []).length })) });
  });

  server.tool("add_po_lines", "Append product lines to a PO (buyer/admin). Read the supplier's confirmation yourself (PDF, photo or pasted text), then call this once with every line as printed.", { poNo: z.string(), lines: z.array(LineInput).min(1) }, async ({ poNo, lines }) => {
    if (user.role === "sale") return fail("POs can be edited by buyer and admin only");
    const row = await findByNumber(db, "pos", "poNo", poNo);
    if (!row) return fail(`PO ${poNo} not found`);
    const { parsed, warnings } = normalise({ lines });
    if (!parsed.lines.length) return fail("No usable lines (each needs a product name)");
    const products = [...(row.data.products || []), ...parsed.lines.map((l) => makeLine(l, true))];
    await commit(db, [upsert("pos", row.id, { ...row.data, products }, row.sale_id)], user);
    return text({ ok: true, poNo, added: parsed.lines.length, totalLines: products.length, warnings });
  });
  }

  /* ---- Mai tasks (admin), Jobs (admin + buyer), Warehouse's Space (admin + buyer). Only the tools a role may use are registered, so the assistant is never offered one it cannot call. ---- */
  const denied = (kind: "maiTasks" | "buyerJobs" | "warehouseEvents", what: string) => (kindAllowed(kind, user) ? null : fail(`${what} are not available to the ${user.role} role`));
  const toIso = (d?: string) => { if (!d) return nowIso().slice(0, 10); const iso = parseDmy(d); return iso === null ? null : iso || nowIso().slice(0, 10); };

  if (kindAllowed("maiTasks", user)) {
  server.tool("list_tasks", "Mai's daily follow-up tasks (admin only).", { status: z.enum(["not_started", "started", "waiting", "done"]).optional() }, async ({ status }) => {
    const no = denied("maiTasks", "Tasks"); if (no) return no;
    const rows = await rowsOfKind(db, "maiTasks");
    return text(rows.filter((r) => !status || r.data.status === status).map((r) => ({ task: r.data.task, sale: r.data.sale, supplier: r.data.supplier, status: r.data.status, added: r.data.createdAt })));
  });

  server.tool("add_task", "Add a task to Mai's tab (admin only). New tasks start as 'not started'.", { task: z.string().min(1), sale: z.string().optional(), supplier: z.string().optional() }, async ({ task, sale, supplier }) => {
    const no = denied("maiTasks", "Tasks"); if (no) return no;
    const now = nowIso();
    const data = { id: uid("mai"), task: task.trim(), sale: sale || "", supplier: supplier || "", status: "not_started", createdAt: now, updatedAt: now };
    await commit(db, [upsert("maiTasks", data.id, data)], user);
    return text({ ok: true, task: data.task, status: data.status });
  });
  }

  if (kindAllowed("buyerJobs", user)) {
  server.tool("list_jobs", "Jobs given to the buyer, with their Buyer's Notes (admin + buyer).", { status: z.enum(["pending", "rejected", "in_process", "done"]).optional() }, async ({ status }) => {
    const no = denied("buyerJobs", "Jobs"); if (no) return no;
    const rows = await rowsOfKind(db, "buyerJobs");
    return text(rows.filter((r) => !status || r.data.status === status).map((r) => ({ givenDate: r.data.givenDate, jobs: r.data.jobs, maiNote: r.data.maiNote, status: r.data.status, notes: (r.data.notes || []).map((n: any) => ({ by: n.by, status: n.statusAtTime, text: n.text, at: n.createdAt })) })));
  });

  server.tool("add_job", "Add a job to the Jobs tab (admin + buyer). Date accepts dd/mm/yyyy or ISO; default today.", { jobs: z.string().min(1), maiNote: z.string().optional(), givenDate: z.string().optional() }, async ({ jobs, maiNote, givenDate }) => {
    const no = denied("buyerJobs", "Jobs"); if (no) return no;
    const date = toIso(givenDate); if (date === null) return fail("givenDate must be dd/mm/yyyy or yyyy-mm-dd");
    const data = { id: uid("job"), givenDate: date, jobs: jobs.trim(), maiNote: maiNote || "", status: "pending", notes: [], createdAt: nowIso() };
    await commit(db, [upsert("buyerJobs", data.id, data)], user);
    return text({ ok: true, jobs: data.jobs, givenDate: date, status: "pending" });
  });

  server.tool("add_job_note", "Append a Buyer's Note to a job, stamped with the job's current status (admin + buyer). Optionally set a new status.", {
    jobs: z.string().min(1).describe("Text of the job to find (contains, case-insensitive)"),
    text: z.string().min(1),
    status: z.enum(["pending", "rejected", "in_process", "done"]).optional().describe("New status after the note"),
  }, async ({ jobs, text: noteText, status }) => {
    const no = denied("buyerJobs", "Jobs"); if (no) return no;
    const rows = await rowsOfKind(db, "buyerJobs");
    const hits = rows.filter((r) => String(r.data.jobs || "").toLowerCase().includes(jobs.toLowerCase()));
    if (hits.length !== 1) return fail(hits.length === 0 ? `No job contains "${jobs}"` : `${hits.length} jobs contain "${jobs}"; be more specific`);
    const row = hits[0];
    const note = { id: uid("jnote"), text: noteText.trim(), statusAtTime: row.data.status, by: user.name, createdAt: nowIso() };
    const data = { ...row.data, notes: [...(row.data.notes || []), note], status: status || row.data.status };
    await commit(db, [upsert("buyerJobs", row.id, data)], user);
    return text({ ok: true, jobs: row.data.jobs, notes: data.notes.length, status: data.status });
  });
  }

  if (kindAllowed("warehouseEvents", user)) {
  server.tool("list_warehouse_events", "Warehouse's Space calendar entries (admin + buyer).", { month: z.string().optional().describe("yyyy-mm; default all") }, async ({ month }) => {
    const no = denied("warehouseEvents", "Calendar entries"); if (no) return no;
    const rows = await rowsOfKind(db, "warehouseEvents");
    return text(rows.filter((r) => !month || String(r.data.date || "").startsWith(month)).sort((a, b) => String(a.data.date).localeCompare(String(b.data.date))).map((r) => ({ date: r.data.date, title: r.data.title, type: r.data.type, refNo: r.data.refNo, note: r.data.note, by: r.data.createdBy })));
  });

  server.tool("add_warehouse_event", "Add a delivery / collection entry to the Warehouse's Space calendar (admin + buyer). Date accepts dd/mm/yyyy or ISO.", {
    date: z.string(), title: z.string().min(1), type: z.enum(["delivery", "collection", "other"]).default("delivery"), refNo: z.string().optional().describe("PO / PFI number"), note: z.string().optional(),
  }, async ({ date, title, type, refNo, note }) => {
    const no = denied("warehouseEvents", "Calendar entries"); if (no) return no;
    const iso = parseDmy(date); if (!iso) return fail("date must be dd/mm/yyyy or yyyy-mm-dd");
    const data = { id: uid("wh"), date: iso, title: title.trim(), type, refNo: refNo || "", note: note || "", createdBy: user.name, createdAt: nowIso() };
    await commit(db, [upsert("warehouseEvents", data.id, data)], user);
    return text({ ok: true, date: iso, title: data.title, type });
  });
  }

  return server;
}
