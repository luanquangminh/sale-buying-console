/*
 * Does what the POs order cover what a PFI line needs? A PO row gives a PFI the cases allocated to it;
 * a PFI line is short while the rows pointing at it, over every PO, add up to less than its quantity.
 * Removed rows give nothing.
 */
import { matchPfiLine } from "./receipts";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const blank = (v) => v === "" || v === undefined || v === null;
const tidy = (n) => Math.round(n * 1000) / 1000;
const live = (status) => status !== "removed";

/** Cases a PO row gives a PFI: what was typed for that PFI, or the whole row while nothing is typed (the PFI side reads it the same way). */
export const allocatedCases = (poLine, ref) => num(blank(ref.allocatedQty) ? poLine.quantity : ref.allocatedQty);

/**
 * Cover of one PFI line. `pfi` is the PFI as the PO screen knows it ({ pfiId, lines }), each line with its
 * quantity and the receipts of the saved POs; `po` is the PO being edited, whose rows count as they are now.
 * null when the line is unknown or has no quantity to compare with.
 */
export function lineCover(pfi, lineId, po) {
  const line = (pfi.lines || []).find((l) => l.id === lineId);
  if (!line) return null;
  const need = num(line.quantity);
  if (need <= 0) return null;
  const others = (line.receipts || []).filter((r) => r.poId !== po.id && live(r.orderStatus)).reduce((acc, r) => acc + num(r.quantity), 0);
  let here = 0;
  for (const p of po.products || []) {
    for (const ref of p.linkedPfiRefs || []) {
      if (ref.pfiId !== pfi.pfiId || !live(ref.orderStatus || p.orderStatus)) continue;
      if (matchPfiLine(pfi.lines, ref, p) === lineId) here += allocatedCases(p, ref);
    }
  }
  const allocated = tidy(here + others);
  return { need, here: tidy(here), others: tidy(others), allocated, short: tidy(Math.max(need - allocated, 0)), over: tidy(Math.max(allocated - need, 0)) };
}

/** Every PFI line this PO points at and leaves short, once each, in the order of the PO's rows. */
export function poShortages(po, pfiOptions) {
  const seen = new Set();
  const out = [];
  for (const p of po.products || []) {
    for (const ref of p.linkedPfiRefs || []) {
      if (!live(ref.orderStatus || p.orderStatus)) continue;
      const pfi = (pfiOptions || []).find((o) => o.pfiId === ref.pfiId);
      if (!pfi) continue;
      const lineId = matchPfiLine(pfi.lines, ref, p);
      if (!lineId || seen.has(`${pfi.pfiId}:${lineId}`)) continue;
      seen.add(`${pfi.pfiId}:${lineId}`);
      const cover = lineCover(pfi, lineId, po);
      if (!cover || cover.short <= 0) continue;
      const line = pfi.lines.find((l) => l.id === lineId);
      out.push({ pfiId: pfi.pfiId, lineId, pfiLabel: pfi.shortLabel, customerName: pfi.customerName, product: line.product, ...cover });
    }
  }
  return out;
}

/**
 * Cover of a PFI line as the PFI screen sees it: the cases of every PO row pointing at it (its receipts)
 * against its quantity. null while no PO row covers the line, or the line has no quantity.
 */
export function pfiLineCover(line) {
  const rows = (line.receipts || []).filter((r) => live(r.orderStatus));
  const need = num(line.quantity);
  if (!rows.length || need <= 0) return null;
  const allocated = tidy(rows.reduce((acc, r) => acc + num(r.quantity), 0));
  return { need, allocated, short: tidy(Math.max(need - allocated, 0)), over: tidy(Math.max(allocated - need, 0)) };
}

/** The lines of a PFI that its POs leave short, in the order of the PFI. */
export function pfiShortages(pfi) {
  const out = [];
  for (const line of pfi.products || []) {
    const cover = pfiLineCover(line);
    if (cover && cover.short > 0) out.push({ lineId: line.id, product: line.product, ...cover });
  }
  return out;
}
