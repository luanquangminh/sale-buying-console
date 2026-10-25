/*
 * Payments Received Tracking: a sale rep notes a payment a customer says is on its way (an expected payment); the
 * accountant notes what the bank shows (a received payment), either confirming an expected one or standing on its own.
 * An expected payment is confirmed when a received one points at it; nothing else has to be kept in step.
 */

import { fmtNumber, numOrNull, round2 } from "./money";

export const PAY_COMPANIES = ["LTD", "LLC"];

/** Newest first by the given date field, then by when it was entered. */
const byNewest = (key) => (a, b) => String(b[key] || "").localeCompare(String(a[key] || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
export const newestFirst = (list, key) => [...list].sort(byNewest(key));

/** The receipts by the expected payment they confirm: one pass over `received`, then a lookup per expected payment. */
const confirmations = (received) => { const m = new Map(); for (const r of received || []) if (r.expectedId) m.set(r.expectedId, r); return m; };
/** The received payment confirming an expected one, or null while the accountant has not seen it. */
export const confirmationOf = (expected, received) => confirmations(received).get(expected.id) || null;
export const isConfirmed = (expected, received) => confirmations(received).has(expected.id);

/** Received minus expected, to the cent; null while either amount is missing. */
export function difference(expected, confirmation) {
  const e = numOrNull(expected && expected.expectedAmount);
  const r = numOrNull(confirmation && confirmation.receivedAmount);
  return e === null || r === null ? null : round2(r - e);
}

/** A rep's own expected payments. */
export const forSale = (expected, saleId) => (expected || []).filter((e) => e.saleId === saleId);

/** Pending (nothing received against them yet, newest first) and confirmed (with their confirmation, newest receipt first). */
export function splitExpected(expected, received) {
  const byExpected = confirmations(received);
  const pending = []; const confirmed = [];
  for (const e of expected || []) {
    const c = byExpected.get(e.id);
    if (c) confirmed.push({ ...e, confirmation: c, diff: difference(e, c) });
    else pending.push(e);
  }
  const newestReceipt = byNewest("receivedDate");
  return { pending: pending.sort(byNewest("date")), confirmed: confirmed.sort((a, b) => newestReceipt(a.confirmation, b.confirmation)) };
}

/** Money the bank shows that no rep announced, newest first; given the expected list, a receipt whose expected payment is gone counts too. */
export const unmatched = (received, expected = null) => {
  const known = expected ? new Set(expected.map((e) => e.id)) : null;
  return newestFirst((received || []).filter((r) => !r.expectedId || (known && !known.has(r.expectedId))), "receivedDate");
};

/** How many expected payments wait for the accountant: the badge on the sidebar. */
export const toConfirmCount = (expected, received) => { const done = confirmations(received); return (expected || []).filter((e) => !done.has(e.id)).length; };

/** "+49.64", "−12.00" or "0.00" — how the gap reads next to its amount. */
export function fmtDiff(diff) {
  if (diff === null || diff === undefined) return "";
  const abs = fmtNumber(Math.abs(diff));
  return diff > 0 ? `+${abs}` : diff < 0 ? `−${abs}` : abs;
}
export const diffTone = (diff) => (diff === null || diff === undefined || diff === 0 ? "grey" : diff < 0 ? "red" : "green");
