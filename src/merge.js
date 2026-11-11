/*
 * A PFI is edited by two roles, each on its own fields: Sale owns the lines themselves, documents
 * and payments; Buyer owns the order-tracking fields on each line and, on each document, the status and the issued file.
 * When one role saves while the other has the same PFI open, the saver must not write stale
 * values of the other role's fields. mergeOtherRole() lays the other role's fields from the newest
 * record over a draft. The INV number is the Sale's, typed after the PFI exists, so a Buyer save takes it from
 * the newest record too. Delivery is shared by both roles: see mergeDelivery.
 */

export const BUYER_LINE_FIELDS = ["orderStatus", "estimatedDeliveryDate", "receivedQuantity", "receivedDate", "bbdReceived", "floorStock"];
export const BUYER_DOC_FIELDS = ["status", "issuedFileName", "issuedFileUrl"];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

/**
 * Delivery is edited by both roles, so a stale draft must not undo the other side's work (a Loaded flag set meanwhile,
 * a POD typed). The block carries `updatedAt`, stamped by the UI on each edit: the block edited later wins, the draft
 * on a tie. With `base` (the record the draft was last synced against) the merge is per field: the draft keeps only
 * the fields it changed since then and takes the rest from the newest record.
 */
export function mergeDelivery(draft, fresh, base) {
  if (!draft || !fresh) return draft || fresh;
  if (base && base.delivery) {
    const out = { ...fresh };
    for (const k of new Set([...Object.keys(draft), ...Object.keys(base.delivery)])) if (draft[k] !== base.delivery[k]) out[k] = draft[k];
    return out;
  }
  return String(fresh.updatedAt || "") > String(draft.updatedAt || "") ? fresh : draft;
}

export function mergeOtherRole(draft, fresh, viewer, base) {
  if (!fresh) return draft;
  const delivery = mergeDelivery(draft.delivery, fresh.delivery, base);
  const dLines = draft.products || [];
  const fLines = fresh.products || [];
  if (viewer === "sale") {
    // keep Sale's lines as drafted; take Buyer's tracking fields and document fields from the newest record
    const products = dLines.map((p) => { const f = fLines.find((x) => x.id === p.id); return f ? { ...p, ...pick(f, BUYER_LINE_FIELDS) } : p; });
    const documents = (draft.documents || []).map((d) => { const f = (fresh.documents || []).find((x) => x.id === d.id); return f ? { ...d, ...pick(f, BUYER_DOC_FIELDS) } : d; });
    return { ...draft, products, documents, delivery };
  }
  // buyer: take Sale's line list, document list and payments from the newest record; keep Buyer's own edits per line and document
  const products = fLines.map((f) => { const d = dLines.find((x) => x.id === f.id); return d ? { ...f, ...pick(d, BUYER_LINE_FIELDS) } : f; });
  const documents = (fresh.documents || []).map((f) => { const d = (draft.documents || []).find((x) => x.id === f.id); return d ? { ...f, ...pick(d, BUYER_DOC_FIELDS) } : f; });
  return { ...draft, products, documents, delivery, payments: fresh.payments || draft.payments, ...("invNo" in fresh ? { invNo: fresh.invNo } : {}) };
}
