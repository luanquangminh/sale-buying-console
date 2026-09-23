/* Status rollups shared by the products table, the Order Tracking list and the buyer's cards. */

const numOrNull = (v) => (v === "" || v === undefined || v === null ? null : Number(v));

/** Label for a PFI line covered by one or more PO rows (receipts) or, on a PO, its PFI allocations. */
export function rollupStatusLabel(receipts) {
  const list = receipts.map((r) => r.orderStatus || "not_ordered");
  if (list.length && list.every((s) => s === "floor_stock")) return "Floor stock";
  if (list.every((s) => s === "received" || s === "floor_stock")) return "Received";
  if (list.some((s) => s === "received" || s === "floor_stock")) return "Partly received";
  if (list.every((s) => s === "ordered")) return "Ordered";
  if (list.some((s) => s === "ordered" || s === "sending_order")) return "Ordering";
  return "Not ordered";
}

/** Cases actually received for a PFI line: the sum over its PO rows, or its own field when no PO covers it. */
export function lineReceivedTotal(p) {
  const receipts = p.receipts || [];
  if (receipts.length) {
    return receipts.reduce((acc, r) => {
      const v = numOrNull(r.receivedQuantity);
      return v === null ? acc : acc === null ? v : acc + v;
    }, null);
  }
  return numOrNull(p.receivedQuantity);
}

/** A line is complete once what arrived covers what was ordered (a surplus still counts). */
export function lineComplete(p) {
  const got = lineReceivedTotal(p);
  const qty = Number(p.quantity || 0);
  return got !== null && qty > 0 && got >= qty;
}

export const TRACKING_STATUSES = ["Pending", "Complete Ordering", "Loaded"];
export const TRACKING_TONE = { Pending: "gray", "Complete Ordering": "blue", Loaded: "green" };

/** Order Tracking overview status: Loaded (delivery flag) → Complete Ordering (all lines complete) → Pending. */
export function pfiTrackingStatus(pfi) {
  if (pfi.delivery && pfi.delivery.loaded === "loaded") return "Loaded";
  const lines = pfi.products || [];
  if (lines.length && lines.every(lineComplete)) return "Complete Ordering";
  return "Pending";
}
