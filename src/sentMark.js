/*
 * Once the order for a PO row has gone out, the buyer has to hear about what the sale changes on the PFI line
 * that row covers. The order has gone out when the PO is marked Sent, or when the row itself says Ordered,
 * Received or Floor stock (buyers set a row to Ordered without touching the PO's Sent button). From then on the
 * link remembers the PFI line as it stood (`sent`: line id, quantity, name, place in the list). A quantity that
 * no longer matches, or a line that is gone, is what the screens flag. A link whose order has not gone out
 * (any more) forgets; a row the buyer marked Removed is left alone.
 */
import { matchPfiLine } from "./receipts";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const live = (status) => status !== "removed";
const ORDER_PLACED = ["ordered", "received", "floor_stock"];

/** Has the order for this PO row gone out? */
export const isSent = (po, line, ref) => po.sentStatus === "sent" || ORDER_PLACED.includes(ref.orderStatus || line.orderStatus);

const snapshot = (lines, lineId, now) => {
  const index = lines.findIndex((l) => l.id === lineId);
  const line = lines[index];
  return { lineId, qty: num(line.quantity), product: line.product || "", index, at: now };
};

/** The PO with `sent` kept up on every link. `linesOf(ref)` gives the lines of the PFI a link points at. Same object back when nothing changes. */
export function stampSent(po, linesOf, now) {
  let touched = false;
  const products = (po.products || []).map((p) => {
    let rowTouched = false;
    const refs = (p.linkedPfiRefs || []).map((ref) => {
      if (!isSent(po, p, ref)) {
        if (!("sent" in ref)) return ref;
        const { sent, ...rest } = ref;
        rowTouched = true;
        return rest;
      }
      const lines = linesOf(ref) || [];
      const lineId = matchPfiLine(lines, ref, p);
      if (!lineId) return ref; // no line, or the line is gone: keep whatever was remembered
      if (ref.sent && ref.sent.lineId === lineId) return ref;
      rowTouched = true;
      return { ...ref, sent: snapshot(lines, lineId, now) };
    });
    if (!rowTouched) return p;
    touched = true;
    return { ...p, linkedPfiRefs: refs };
  });
  return touched ? { ...po, products } : po;
}

/**
 * For POs that were sent before links remembered anything. The PFI lines as they stood at an earlier moment
 * (`linesThen`, from a copy of the data) become the reference, so that what Sale changed since then shows.
 * Links that already remember, rows marked Removed and rows whose order has not gone out are left alone. Same object back when nothing changes.
 */
export function stampSentAsOf(po, linesNow, linesThen, at) {
  let touched = false;
  const products = (po.products || []).map((p) => {
    let rowTouched = false;
    const refs = (p.linkedPfiRefs || []).map((ref) => {
      if (ref.sent || !isSent(po, p, ref) || !live(ref.orderStatus || p.orderStatus)) return ref;
      const now = linesNow(ref) || [];
      const then = linesThen(ref) || [];
      const lineId = matchPfiLine(now, ref, p) || matchPfiLine(then, ref, p); // still there, or there then and removed since
      if (!lineId) return ref;
      const from = then.some((l) => l.id === lineId) ? then : now; // a line added since then starts from what it is now
      rowTouched = true;
      return { ...ref, sent: snapshot(from, lineId, at) };
    });
    if (!rowTouched) return p;
    touched = true;
    return { ...p, linkedPfiRefs: refs };
  });
  return touched ? { ...po, products } : po;
}

/** What the sale did to the PFI line since the PO was sent: null, { kind: "changed", product, from, to } or { kind: "removed", product }. */
export function changeSinceSent(ref, lines) {
  const s = ref && ref.sent;
  if (!s || !live(ref.orderStatus)) return null;
  const line = (lines || []).find((l) => l.id === s.lineId);
  if (!line) return { kind: "removed", product: s.product };
  const to = num(line.quantity);
  return to === num(s.qty) ? null : { kind: "changed", product: line.product || s.product, from: num(s.qty), to };
}

/** The buyer has seen the change: the line as it is now becomes the reference. null when the line is gone. */
export function acknowledged(sent, lines, now) {
  return (lines || []).some((l) => l.id === sent.lineId) ? snapshot(lines, sent.lineId, now) : null;
}

/** PFI side: a line whose quantity differs from what sent POs remember of it, with the POs concerned. */
export function lineChange(line) {
  const to = num(line.quantity);
  const stale = (line.receipts || []).filter((r) => r.sent && live(r.orderStatus) && num(r.sent.qty) !== to);
  if (!stale.length) return null;
  return { from: num(stale[0].sent.qty), to, pos: [...new Set(stale.map((r) => String(r.poNo)))] };
}

/** PFI side: the lines removed after a PO covering them was sent, one entry per line, in the order they had. */
export function removedSinceSent(pfi) {
  const present = new Set((pfi.products || []).map((p) => p.id));
  const byLine = new Map();
  for (const r of pfi.unmatchedReceipts || []) {
    if (!r.sent || !live(r.orderStatus) || present.has(r.sent.lineId)) continue;
    const hit = byLine.get(r.sent.lineId) || { lineId: r.sent.lineId, product: r.sent.product, index: r.sent.index, pos: [] };
    if (!hit.pos.includes(String(r.poNo))) hit.pos.push(String(r.poNo));
    byLine.set(r.sent.lineId, hit);
  }
  return [...byLine.values()].sort((a, b) => a.index - b.index);
}
