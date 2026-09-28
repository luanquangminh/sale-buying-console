/* Status rollups shared by the products table, the Order Tracking list and the buyer's cards. */

const numOrNull = (v) => (v === "" || v === undefined || v === null ? null : Number(v));

/** A PO-wide status change (sent, received) leaves rows the buyer marked Removed as they are. */
export const keepRemoved = (current, next) => (current === "removed" ? current : next);

/** A line is removed when every PO row covering it is removed or, with no PO row, when its own status is. */
export function lineRemoved(p) {
  const receipts = p.receipts || [];
  if (receipts.length) return receipts.every((r) => r.orderStatus === "removed");
  return p.orderStatus === "removed";
}

/** Label for a PFI line covered by one or more PO rows (receipts) or, on a PO, its PFI allocations. Removed rows are left out. */
export function rollupStatusLabel(receipts) {
  const all = receipts.map((r) => r.orderStatus || "not_ordered");
  const list = all.filter((s) => s !== "removed");
  if (all.length && !list.length) return "Removed";
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
    return receipts.filter((r) => r.orderStatus !== "removed").reduce((acc, r) => {
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

/** Order Tracking overview status: Loaded (delivery flag) → Complete Ordering (all lines complete, removed ones ignored) → Pending. */
export function pfiTrackingStatus(pfi) {
  if (pfi.delivery && pfi.delivery.loaded === "loaded") return "Loaded";
  const lines = (pfi.products || []).filter((p) => !lineRemoved(p));
  if (lines.length && lines.every(lineComplete)) return "Complete Ordering";
  return "Pending";
}
