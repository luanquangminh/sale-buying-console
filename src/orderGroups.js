/* Orders to update: the PFIs listed under the sale rep they belong to. */
import { pfiTrackingStatus, TRACKING_STATUSES } from "./status";
import { lineChange, removedSinceSent } from "./sentMark";

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** Does the PFI carry a change by Sale that a sent PO has not caught up with? */
export const hasSaleChange = (pfi) => (pfi.products || []).some((p) => lineChange(p)) || removedSinceSent(pfi).length > 0;

/**
 * One group per sale rep that has PFIs, A → Z by name. Inside a group: Pending first, then Complete Ordering,
 * then Loaded, each in the order the list already had (newest first).
 */
export function groupBySale(pfisBySale, nameOf = () => "") {
  const groups = Object.entries(pfisBySale || {})
    .filter(([, list]) => (list || []).length > 0)
    .map(([saleId, list]) => {
      const rows = list.map((pfi, i) => ({ pfi, i, status: pfiTrackingStatus(pfi) }));
      rows.sort((a, b) => TRACKING_STATUSES.indexOf(a.status) - TRACKING_STATUSES.indexOf(b.status) || a.i - b.i);
      const counts = Object.fromEntries(TRACKING_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
      return {
        saleId,
        saleName: nameOf(saleId) || (list.find((p) => p.saleName) || {}).saleName || "Sale",
        pfis: rows.map((r) => r.pfi),
        counts,
        changed: list.filter(hasSaleChange).length,
      };
    });
  return groups.sort((a, b) => byName(a.saleName, b.saleName) || byName(a.saleId, b.saleId));
}
