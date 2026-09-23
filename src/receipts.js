/*
 * How a PO row reaches a PFI line. Each PO product carries `linkedPfiRefs[]` (one per PFI it is split
 * across). A ref names the PFI and, since v1.1, the PFI line (`pfiProductId`). Older refs have no line
 * id, so the match falls back to EAN, then case barcode, then a normalised product name. An explicit id
 * whose line was deleted leaves the row unmatched (visible on the PFI) rather than re-matching it.
 */

export const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The id of the PFI line a PO row covers, or null when nothing matches. */
export function matchPfiLine(pfiProducts, ref, poLine) {
  const lines = pfiProducts || [];
  // Explicit choice (a line id, or "" for "no line"): honoured as is, never re-routed. null/undefined = auto-match.
  if (ref && ref.pfiProductId != null) return lines.some((p) => p.id === ref.pfiProductId) ? ref.pfiProductId : null;
  const ean = String((poLine && poLine.ean) || "").trim();
  if (ean) { const hit = lines.find((p) => String(p.ean || "").trim() === ean); if (hit) return hit.id; }
  const cb = String((poLine && poLine.caseBarcode) || "").trim();
  if (cb) { const hit = lines.find((p) => String(p.caseBarcode || "").trim() === cb); if (hit) return hit.id; }
  const name = normName(poLine && poLine.product);
  if (name) { const hit = lines.find((p) => normName(p.product) === name); if (hit) return hit.id; }
  return null;
}

/** What the PFI side sees of one PO row for one PFI. */
export function buildReceipt(po, pr, ref) {
  return {
    poId: po.id, poLineId: pr.id, pfiId: ref.pfiId, poNo: po.poNo,
    poProduct: pr.product || "", poEan: pr.ean || "",
    pfiProductId: ref.pfiProductId || null,
    quantity: ref.allocatedQty === "" || ref.allocatedQty === undefined ? pr.quantity : ref.allocatedQty,
    receivedQuantity: ref.receivedQty ?? "",
    orderStatus: ref.orderStatus || pr.orderStatus,
    estimatedDeliveryDate: ref.estimatedDeliveryDate || pr.estimatedDeliveryDate || "",
    receivedDate: ref.receivedDate || pr.receivedDate || "",
    bbdReceived: ref.bbdReceived || pr.bbdReceived || "",
  };
}

/**
 * Attach every PO row to the PFI line it covers. Derived data only: `receipts` on each line and
 * `unmatchedReceipts` on the PFI are stripped before anything is stored.
 */
export function applyReceipts(pfisBySale, posArr) {
  const byPfi = {};
  for (const po of posArr || []) {
    for (const pr of po.products || []) {
      for (const ref of pr.linkedPfiRefs || []) (byPfi[ref.pfiId] ||= []).push({ po, pr, ref });
    }
  }
  const next = {};
  for (const saleId of Object.keys(pfisBySale || {})) {
    next[saleId] = (pfisBySale[saleId] || []).map((pfi) => {
      const products = pfi.products || [];
      const byLine = {};
      const unmatched = [];
      for (const e of byPfi[pfi.id] || []) {
        const lineId = matchPfiLine(products, e.ref, e.pr);
        const receipt = buildReceipt(e.po, e.pr, e.ref);
        if (lineId) (byLine[lineId] ||= []).push(receipt);
        else unmatched.push(receipt);
      }
      return {
        ...pfi,
        products: products.map((p) => ({ ...p, receipts: byLine[p.id] || [] })),
        unmatchedReceipts: unmatched,
      };
    });
  }
  return next;
}

/** Remove the derived fields before comparing or storing a PFI. */
export function stripDerived(pfi) {
  const { unmatchedReceipts, ...rest } = pfi;
  return { ...rest, products: (rest.products || []).map(({ receipts, ...p }) => p) };
}
