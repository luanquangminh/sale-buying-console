/* Record access for the MCP tools: same `records` table and change counter the UI sync uses. */
import { applyChanges, type Change } from "../sync";
import type { User } from "../types";

export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const nowIso = () => new Date().toISOString();
export const computeAmount = (qty: unknown, rate: unknown) => +(((parseFloat(String(qty)) || 0) * (parseFloat(String(rate)) || 0)).toFixed(2));

export type Row = { id: string; sale_id: string | null; created_at: string; data: any };

export async function rowsOfKind(db: D1Database, kind: string, saleId?: string | null): Promise<Row[]> {
  const stmt = saleId
    ? db.prepare("SELECT id, sale_id, created_at, data FROM records WHERE kind = ? AND sale_id = ? ORDER BY created_at DESC").bind(kind, saleId)
    : db.prepare("SELECT id, sale_id, created_at, data FROM records WHERE kind = ? ORDER BY created_at DESC").bind(kind);
  const { results } = await stmt.all<{ id: string; sale_id: string | null; created_at: string; data: string }>();
  return results.map((r) => ({ id: r.id, sale_id: r.sale_id, created_at: r.created_at, data: JSON.parse(r.data) }));
}

export async function findByNumber(db: D1Database, kind: "pfis" | "pos", field: "pfiNo" | "poNo", value: string): Promise<Row | null> {
  const row = await db
    .prepare(`SELECT id, sale_id, created_at, data FROM records WHERE kind = ? AND json_extract(data, '$.${field}') = ? LIMIT 1`)
    .bind(kind, String(value))
    .first<{ id: string; sale_id: string | null; created_at: string; data: string }>();
  return row ? { id: row.id, sale_id: row.sale_id, created_at: row.created_at, data: JSON.parse(row.data) } : null;
}

export const upsert = (kind: string, id: string, data: any, saleId: string | null = null): Change => ({ kind, id, saleId, data, createdAt: data.createdAt || null });

export const commit = (db: D1Database, changes: Change[], user?: User) => applyChanges(db, changes, user);

/** Sale reps see their own records; admin and buyer see everything. */
export const scopeSaleId = (user: User) => (user.role === "sale" ? user.id : null);

/** Product line as the UI stores it. */
export function makeLine(l: { product: string; ean?: string; caseBarcode?: string; pack?: string; bbd?: string; quantity?: number | ""; rate?: number | ""; vat?: string }, forPo = false) {
  const line: any = {
    id: uid("prod"),
    ean: l.ean || "", caseBarcode: l.caseBarcode || "", product: l.product, caseSize: l.pack || "", bbd: l.bbd || "",
    quantity: l.quantity === "" || l.quantity === undefined ? "" : l.quantity,
    rate: l.rate === "" || l.rate === undefined ? "" : l.rate,
    vat: l.vat || "0.0% Z", amount: computeAmount(l.quantity, l.rate),
    orderStatus: "not_ordered", estimatedDeliveryDate: "", receivedQuantity: "", receivedDate: "", bbdReceived: "", reorder: false,
  };
  if (forPo) line.linkedPfiRefs = [];
  return line;
}
