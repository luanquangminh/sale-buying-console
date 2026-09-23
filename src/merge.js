/*
 * A PFI is edited by two roles, each on its own fields: Sale owns the lines themselves, documents
 * and payments; Buyer owns the order-tracking fields on each line and each document's status.
 * When one role saves while the other has the same PFI open, the saver must not write stale
 * values of the other role's fields. mergeOtherRole() lays the other role's fields from the newest
 * record over a draft. Delivery is shared and stays as the draft has it.
 */

export const BUYER_LINE_FIELDS = ["orderStatus", "estimatedDeliveryDate", "receivedQuantity", "receivedDate", "bbdReceived"];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export function mergeOtherRole(draft, fresh, viewer) {
  if (!fresh) return draft;
  const dLines = draft.products || [];
  const fLines = fresh.products || [];
  if (viewer === "sale") {
    // keep Sale's lines as drafted; take Buyer's tracking fields and document statuses from the newest record
    const products = dLines.map((p) => { const f = fLines.find((x) => x.id === p.id); return f ? { ...p, ...pick(f, BUYER_LINE_FIELDS) } : p; });
    const documents = (draft.documents || []).map((d) => { const f = (fresh.documents || []).find((x) => x.id === d.id); return f && "status" in f ? { ...d, status: f.status } : d; });
    return { ...draft, products, documents };
  }
  // buyer: take Sale's line list, document list and payments from the newest record; keep Buyer's own edits per line and document
  const products = fLines.map((f) => { const d = dLines.find((x) => x.id === f.id); return d ? { ...f, ...pick(d, BUYER_LINE_FIELDS) } : f; });
  const documents = (fresh.documents || []).map((f) => { const d = (draft.documents || []).find((x) => x.id === f.id); return d && "status" in d ? { ...f, status: d.status } : f; });
  return { ...draft, products, documents, payments: fresh.payments || draft.payments };
}
