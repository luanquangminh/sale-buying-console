/*
 * Payments Received Tracking: a sale rep notes a payment a customer says is on its way (an expected payment); the
 * accountant notes what the bank shows (a received payment), either confirming an expected one or standing on its own.
 * An expected payment is confirmed when a received one points at it; nothing else has to be kept in step.
 */

export const PAY_COMPANIES = ["LTD", "LLC"];

const numOrNull = (v) => { if (v === "" || v === undefined || v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const round2 = (n) => Math.round(n * 100) / 100;
const when = (r, key) => `${r[key] || ""}T${r.createdAt || ""}`;
/** Newest first by the given date field, then by when it was entered. */
export const newestFirst = (list, key) => [...list].sort((a, b) => when(b, key).localeCompare(when(a, key)));

/** The received payment confirming an expected one, or null while the accountant has not seen it. */
export const confirmationOf = (expected, received) => (received || []).find((r) => r.expectedId && r.expectedId === expected.id) || null;
export const isConfirmed = (expected, received) => Boolean(confirmationOf(expected, received));

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
  const pending = []; const confirmed = [];
  for (const e of expected || []) {
    const c = confirmationOf(e, received);
    if (c) confirmed.push({ ...e, confirmation: c, diff: difference(e, c) });
    else pending.push(e);
  }
  return {
    pending: newestFirst(pending, "date"),
    confirmed: [...confirmed].sort((a, b) => when(b.confirmation, "receivedDate").localeCompare(when(a.confirmation, "receivedDate"))),
  };
}

/** Money the bank shows that no rep announced, newest first. */
export const unmatched = (received) => newestFirst((received || []).filter((r) => !r.expectedId), "receivedDate");

/** Money that reached the bank without being announced: the accountant's own entries. */
export const toConfirmCount = (expected, received) => splitExpected(expected, received).pending.length;

/** "+49.64", "−12.00" or "0.00" — how the gap reads next to its amount. */
export function fmtDiff(diff) {
  if (diff === null || diff === undefined) return "";
  const abs = Math.abs(diff).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return diff > 0 ? `+${abs}` : diff < 0 ? `−${abs}` : abs;
}
export const diffTone = (diff) => (diff === null || diff === undefined || diff === 0 ? "grey" : diff < 0 ? "red" : "green");
