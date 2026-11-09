/*
 * The papers a PFI needs (COO, health certificate, bill of lading…). The Sale lists them on the PFI with a note
 * and, for the invoice and packing list, a file; the Buyer applies for each one and moves its status along.
 * Once the Sale marks the PFI's delivery Loaded, the Buyer's Documents tab lists the PFI until every paper is Done.
 */

export const DOC_TYPES = ["COO", "HC", "BL", "SWB", "Free Sale", "PL", "INV", "EUR1"];

export const DOC_STATUSES = [
  { value: "not_applied", label: "Have not applied" },
  { value: "applied", label: "Applied" },
  { value: "waiting_delivery", label: "Waiting for Document Delivery" },
  { value: "done", label: "Done" },
];
export const DOC_STATUS_LABEL = Object.fromEntries(DOC_STATUSES.map((s) => [s.value, s.label]));
export const DOC_STATUS_TONE = { not_applied: "grey", applied: "amber", waiting_delivery: "blue", done: "green" };

/** How far a PFI's papers have come: only "done" counts as done; everything else is still open. */
export function docProgress(documents) {
  const list = documents || [];
  const done = list.filter((d) => d.status === "done").length;
  return { total: list.length, done, open: list.length - done };
}

/**
 * The rows of the Buyer's Documents tab: every PFI whose delivery is Loaded and that has documents, newest PFI first.
 * A PFI whose papers are all Done drops off the list unless showDone asks for it.
 */
export function awaitingDocuments(pfisBySale, { showDone = false } = {}) {
  const rows = [];
  for (const [saleId, list] of Object.entries(pfisBySale || {})) {
    for (const pfi of list || []) {
      if (!pfi.delivery || pfi.delivery.loaded !== "loaded") continue;
      const progress = docProgress(pfi.documents);
      if (progress.total === 0) continue;
      if (progress.open === 0 && !showDone) continue;
      rows.push({ pfi, saleId });
    }
  }
  return rows.sort((a, b) => String(b.pfi.createdAt || "").localeCompare(String(a.pfi.createdAt || "")));
}
