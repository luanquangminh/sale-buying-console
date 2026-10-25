/* Status rollups shared by the products table, the Order Tracking list and the buyer's cards. */

const numOrNull = (v) => (v === "" || v === undefined || v === null ? null : Number(v));

/** Cases of a PFI line already on the floor (the buyer's "Floor stock" box); 0 when blank. */
export const floorStockOf = (p) => { const n = Number(p && p.floorStock); return Number.isFinite(n) && n > 0 ? n : 0; };

/** A PO-wide status change (sent, received) leaves rows the buyer marked Removed as they are. */
export const keepRemoved = (current, next) => (current === "removed" ? current : next);

/** A line is removed when every PO row covering it is removed or, with no PO row, when its own status is. */
export function lineRemoved(p) {
  const receipts = p.receipts || [];
  if (receipts.length) return receipts.every((r) => r.orderStatus === "removed");
  return p.orderStatus === "removed";
}

/** The statuses that make up a PFI line's label: its PO rows, plus one "floor stock" for the cases already on the floor. */
export const lineStatusSource = (p) => [...(p.receipts || []), ...(floorStockOf(p) > 0 ? [{ orderStatus: "floor_stock" }] : [])];

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

/** Cases that arrived for a PFI line: the sum over its PO rows, or its own field when no PO covers it. null while nothing has. */
export function lineArrived(p) {
  const receipts = p.receipts || [];
  if (receipts.length) {
    return receipts.filter((r) => r.orderStatus !== "removed").reduce((acc, r) => {
      const v = numOrNull(r.receivedQuantity);
      return v === null ? acc : acc === null ? v : acc + v;
    }, null);
  }
  return numOrNull(p.receivedQuantity);
}

/**
 * Cases a PFI line has in hand: what arrived plus its floor stock. Floor stock on its own counts only when it covers
 * the whole line; a part of the line taken from the floor waits for the rest to arrive before the line is judged.
 */
export function lineReceivedTotal(p) {
  const arrived = lineArrived(p);
  const floor = floorStockOf(p);
  if (arrived !== null) return arrived + floor;
  return floor > 0 && floor >= Number(p.quantity || 0) ? floor : null;
}

/** How many cases the line still lacks once judged (see lineReceivedTotal): 0 when complete or not judged yet. */
export function lineShort(p) {
  const got = lineReceivedTotal(p);
  if (got === null) return 0;
  return Math.max(Number(p.quantity || 0) - got, 0);
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
