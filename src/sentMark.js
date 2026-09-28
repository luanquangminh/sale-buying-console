/*
 * Once the order for a PO row has gone out, the buyer has to hear about what the sale changes on the PFI line
 * that row covers. The order has gone out when the PO is marked Sent, or when the row itself says Ordered,
 * Received or Floor stock (buyers set a row to Ordered without touching the PO's Sent button). From then on the
 * link remembers the PFI line as it stood (`sent`: line id, place in the list, and what Sale can change on a
 * line: name, EAN, case barcode, pack, BBD, VAT, quantity, rate). Anything that no longer matches, or a line
 * that is gone, is what the screens flag. A link whose order has not gone out (any more) forgets; a row the
 * buyer marked Removed is left alone.
 */
import { matchPfiLine } from "./receipts";
import { vatOption } from "./money";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/** What is remembered of a line, in the order the screens name it. `key` is the name in the snapshot, `read` makes two values comparable. */
const TRACKED = [
  { field: "quantity", key: "qty", label: "quantity", read: num },
  { field: "product", key: "product", label: "name", read: text },
  { field: "ean", key: "ean", label: "EAN", read: text },
  { field: "caseBarcode", key: "caseBarcode", label: "case barcode", read: text },
  { field: "caseSize", key: "caseSize", label: "pack", read: text },
  { field: "bbd", key: "bbd", label: "BBD", read: text },
  { field: "vat", key: "vat", label: "VAT", read: vatOption },
  { field: "rate", key: "rate", label: "rate", read: num },
];
const live = (status) => status !== "removed";
const ORDER_PLACED = ["ordered", "received", "floor_stock"];

/** Has the order for this PO row gone out? */
export const isSent = (po, line, ref) => po.sentStatus === "sent" || ORDER_PLACED.includes(ref.orderStatus || line.orderStatus);

const snapshot = (lines, lineId, now) => {
  const index = lines.findIndex((l) => l.id === lineId);
  const line = lines[index];
  return { lineId, index, at: now, ...Object.fromEntries(TRACKED.map((t) => [t.key, t.read(line[t.field])])) };
};

/** A reference taken when only the quantity and the name were remembered: the rest is added from `line`, what it had is kept. */
const completed = (sent, line) => {
  const missing = TRACKED.filter((t) => !(t.key in sent));
  return missing.length ? { ...sent, ...Object.fromEntries(missing.map((t) => [t.key, t.read(line[t.field])])) } : sent;
};

/** What differs between a reference and the line as it is: [{ field, label, from, to }]. What the reference never held is not compared. */
export function changesOf(sent, line) {
  return TRACKED
    .filter((t) => t.key in sent && t.read(sent[t.key]) !== t.read(line[t.field]))
    .map((t) => ({ field: t.field, label: t.label, from: t.read(sent[t.key]), to: t.read(line[t.field]) }));
}

/** "quantity was 1400; rate was 13.2": for a screen that shows the line as it is now */
export const describeWas = (changes) => changes.map((c) => `${c.label} was ${c.from === "" ? "empty" : c.from}`).join("; ");

/** "quantity 1400 → 1500; rate 13.2 → 13.5" */
export const describeChanges = (changes) => changes.map((c) => `${c.label} ${c.from === "" ? "(empty)" : c.from} → ${c.to === "" ? "(empty)" : c.to}`).join("; ");

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
      if (ref.sent && ref.sent.lineId === lineId) {
        const full = completed(ref.sent, lines.find((l) => l.id === lineId));
        if (full === ref.sent) return ref;
        rowTouched = true;
        return { ...ref, sent: full };
      }
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
 * What a link already remembers is kept; a reference that only held the quantity and the name gets the rest from the
 * same earlier moment. Rows marked Removed and rows whose order has not gone out are left alone. Same object back when nothing changes.
 */
export function stampSentAsOf(po, linesNow, linesThen, at) {
  let touched = false;
  const products = (po.products || []).map((p) => {
    let rowTouched = false;
    const refs = (p.linkedPfiRefs || []).map((ref) => {
      if (!isSent(po, p, ref) || !live(ref.orderStatus || p.orderStatus)) return ref;
      const now = linesNow(ref) || [];
      const then = linesThen(ref) || [];
      if (ref.sent) {
        const line = then.find((l) => l.id === ref.sent.lineId) || now.find((l) => l.id === ref.sent.lineId);
        const full = line ? completed(ref.sent, line) : ref.sent;
        if (full === ref.sent) return ref;
        rowTouched = true;
        return { ...ref, sent: full };
      }
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

/**
 * What the sale did to the PFI line since the order went out: null, { kind: "removed", product } or
 * { kind: "changed", product, changes } (with `from` and `to` of the quantity when that is among them).
 */
export function changeSinceSent(ref, lines) {
  const s = ref && ref.sent;
  if (!s || !live(ref.orderStatus)) return null;
  const line = (lines || []).find((l) => l.id === s.lineId);
  if (!line) return { kind: "removed", product: s.product };
  const changes = changesOf(s, line);
  if (!changes.length) return null;
  const qty = changes.find((c) => c.field === "quantity");
  return { kind: "changed", product: line.product || s.product, changes, ...(qty ? { from: qty.from, to: qty.to } : {}) };
}

/** The buyer has seen the change: the line as it is now becomes the reference. null when the line is gone. */
export function acknowledged(sent, lines, now) {
  return (lines || []).some((l) => l.id === sent.lineId) ? snapshot(lines, sent.lineId, now) : null;
}

/** PFI side: a line that differs from what POs remember of it: what changed (each field once, as the first PO remembers it) and the POs concerned. */
export function lineChange(line) {
  const stale = (line.receipts || []).filter((r) => r.sent && live(r.orderStatus) && changesOf(r.sent, line).length > 0);
  if (!stale.length) return null;
  const changes = [];
  for (const r of stale) for (const c of changesOf(r.sent, line)) if (!changes.some((x) => x.field === c.field)) changes.push(c);
  const qty = changes.find((c) => c.field === "quantity");
  return { changes, pos: [...new Set(stale.map((r) => String(r.poNo)))], stale, ...(qty ? { from: qty.from, to: qty.to } : {}) };
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
