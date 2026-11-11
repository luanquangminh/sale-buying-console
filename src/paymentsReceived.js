/*
 * Payments Received Tracking: a sale rep notes a payment a customer says is on its way (an expected payment); the
 * accountant notes what the bank shows (a received payment), either confirming an expected one or standing on its own.
 * An expected payment is confirmed when a received one points at it; nothing else has to be kept in step.
 * Money nobody announced is shown to every rep; a rep claims it with an expected payment that names the receipt
 * (`receivedId`), and the accountant confirms the claim the usual way, by pointing the receipt at it.
 */

import { fmtDate } from "./dates";
import { fmtNumber, numOrNull, round2 } from "./money";

export const PAY_COMPANIES = ["LTD", "LLC"];
/** Who enters receipts into QuickBooks: the choices of the Added by box. */
export const QB_ADDERS = ["Mai", "Karan"];

/** Newest first by the given date field, then by when it was entered. */
const byNewest = (key) => (a, b) => String(b[key] || "").localeCompare(String(a[key] || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
export const newestFirst = (list, key) => [...list].sort(byNewest(key));

/** The receipts by the expected payment they confirm: one pass over `received`, then a lookup per expected payment. */
const confirmations = (received) => { const m = new Map(); for (const r of received || []) if (r.expectedId) m.set(r.expectedId, r); return m; };
/** The received payment confirming an expected one, or null while the accountant has not seen it. */
export const confirmationOf = (expected, received) => confirmations(received).get(expected.id) || null;
export const isConfirmed = (expected, received) => confirmations(received).has(expected.id);
/** The reps' claims on unannounced money, by the receipt claimed; when two claim the same receipt, the later in the list counts. */
const claims = (expected) => { const m = new Map(); for (const e of expected || []) if (e.receivedId) m.set(e.receivedId, e); return m; };
/** A receipt nothing confirms: it points at no announcement, or (given the list) at one that is gone. */
const unconfirmed = (r, known) => !r.expectedId || Boolean(known && !known.has(r.expectedId));

/** Received minus expected, to the cent; null while either amount is missing. */
export function difference(expected, confirmation) {
  const e = numOrNull(expected && expected.expectedAmount);
  const r = numOrNull(confirmation && confirmation.receivedAmount);
  return e === null || r === null ? null : round2(r - e);
}

/** A rep's own expected payments. */
export const forSale = (expected, saleId) => (expected || []).filter((e) => e.saleId === saleId);

/**
 * Pending (nothing received against them yet, newest first), confirmed (with their confirmation, newest receipt first) and
 * claimed (a claim on unannounced money the accountant has not confirmed, with its receipt). A claim whose receipt is gone,
 * confirmed elsewhere or claimed by another counts as pending: the announcement stands.
 */
export function splitExpected(expected, received) {
  const byExpected = confirmations(received);
  const known = new Set((expected || []).map((e) => e.id));
  const receipts = new Map((received || []).map((r) => [r.id, r]));
  const claimOf = claims(expected);
  const pending = []; const confirmed = []; const claimed = [];
  for (const e of expected || []) {
    const c = byExpected.get(e.id);
    const r = e.receivedId ? receipts.get(e.receivedId) : null;
    if (c) confirmed.push({ ...e, confirmation: c, diff: difference(e, c) });
    else if (r && unconfirmed(r, known) && claimOf.get(r.id) === e) claimed.push({ ...e, receipt: r, diff: difference(e, r) });
    else pending.push(e);
  }
  const newestReceipt = byNewest("receivedDate");
  return { pending: pending.sort(byNewest("date")), confirmed: confirmed.sort((a, b) => newestReceipt(a.confirmation, b.confirmation)), claimed: claimed.sort((a, b) => newestReceipt(a.receipt, b.receipt)) };
}

/** Receipts no announcement confirms, newest first, each with the rep's claim on it (null while nobody claims it); given the expected list, a receipt whose announcement is gone counts too. */
export function unmatchedRows(received, expected = null) {
  const known = expected ? new Set(expected.map((e) => e.id)) : null;
  const claimOf = claims(expected);
  return newestFirst((received || []).filter((r) => unconfirmed(r, known)), "receivedDate").map((r) => ({ receipt: r, claim: claimOf.get(r.id) || null }));
}
/** Money the bank shows that no rep announced or claimed, newest first. */
export const unmatched = (received, expected = null) => unmatchedRows(received, expected).filter((x) => !x.claim).map((x) => x.receipt);

/** How many expected payments wait for the accountant, claims included: the badge on the sidebar. */
export const toConfirmCount = (expected, received) => { const done = confirmations(received); return (expected || []).filter((e) => !done.has(e.id)).length; };

/** "+49.64", "−12.00" or "0.00" — how the gap reads next to its amount. */
export function fmtDiff(diff) {
  if (diff === null || diff === undefined) return "";
  const abs = fmtNumber(Math.abs(diff));
  return diff > 0 ? `+${abs}` : diff < 0 ? `−${abs}` : abs;
}
export const diffTone = (diff) => (diff === null || diff === undefined || diff === 0 ? "grey" : diff < 0 ? "red" : "green");

/** `dd/mm/yyyy hh:mm · Name`: when the receipt went into QuickBooks and who entered it; "" while nothing is noted. */
export const qbText = (qb) => (qb ? [[fmtDate(qb.date), qb.time].filter(Boolean).join(" "), qb.addedBy].filter(Boolean).join(" · ") : "");

/* The accountant's screen is the finance Excel: one ledger a month, the bank's side on the left, the rep's on the right. */

export const monthOf = (iso) => String(iso || "").slice(0, 7);

/** The first and last day of a `yyyy-mm` month. */
export function monthRange(month) {
  const [y, m] = String(month).split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}

/**
 * Every payment as one ledger row, oldest first like the Excel: `pending` (announced, nothing received yet), `confirmed`
 * (announced and received), `loose` (received, nobody announced or claims it) and `claimed` (received, a rep claims it, the
 * accountant has not confirmed). `date` places the row in a month: the bank's date once there is one, else the rep's, else
 * the day it was entered.
 */
export function ledgerRows(expected, received) {
  const { pending, confirmed } = splitExpected(expected, received);
  const dateOf = (iso, rec) => iso || String(rec.createdAt || "").slice(0, 10);
  const rows = [
    ...pending.map((e) => ({ kind: "pending", id: e.id, date: dateOf(e.date, e), expected: e, received: null, diff: null, createdAt: e.createdAt || "" })),
    ...confirmed.map((e) => ({ kind: "confirmed", id: e.id, date: dateOf(e.confirmation.receivedDate || e.date, e), expected: e, received: e.confirmation, diff: e.diff, createdAt: e.confirmation.createdAt || "" })),
    ...unmatchedRows(received, expected || []).map(({ receipt: r, claim: c }) => ({ kind: c ? "claimed" : "loose", id: r.id, date: dateOf(r.receivedDate, r), expected: c, received: r, diff: c ? difference(c, r) : null, createdAt: r.createdAt || "" })),
  ];
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** The accountant's row filters: To confirm is what awaits the accountant, Unmatched the money nobody announced; a claimed row is both. */
export const LEDGER_FILTERS = [["all", "All"], ["pending", "To confirm"], ["loose", "Unmatched"]];
export const inFilter = (kind, filter) => filter === "all" || kind === filter || kind === "claimed";

/** The months the ledger spans, newest first, today's month always among them; each with how many of its rows wait to be confirmed. */
export function ledgerMonths(rows, todayIso) {
  const m = new Map([[monthOf(todayIso), 0]]);
  for (const r of rows) m.set(monthOf(r.date), (m.get(monthOf(r.date)) || 0) + (inFilter(r.kind, "pending") ? 1 : 0));
  return [...m].map(([month, toConfirm]) => ({ month, toConfirm })).sort((a, b) => b.month.localeCompare(a.month));
}

/** Who entered the sales half: the rep who announced or claimed it; for money nobody did, the accountant who typed it. */
export const enteredBy = ({ expected: e, received: r }, repName = () => "") => (e ? e.saleName || repName(e.saleId) || "" : (r && r.confirmedBy) || "");

/* The export: the ledger between two dates as the Excel sheet, the same two header rows and columns as the screen. */
export const inSpan = (row, from, to) => (!from || row.date >= from) && (!to || row.date <= to);
export const LEDGER_GROUPS = [["Details entered by Finance", 6], ["Details confirmed by Sales", 6], ["Difference", 1]];
export const LEDGER_COLUMNS = ["Date", "Company", "Currency", "Amount received", "Sender", "Date & time added in QB", "Date of confirmation", "Customer", "Currency", "Amount expected", "Proof of payment", "Entered by", "Amount different"];
export function ledgerSheet(rows, from, to, repName = () => "") {
  const groups = []; const merges = [];
  for (const [label, span] of LEDGER_GROUPS) { merges.push({ s: { r: 0, c: groups.length }, e: { r: 0, c: groups.length + span - 1 } }); groups.push(label, ...Array(span - 1).fill("")); }
  const num = (v) => { const n = numOrNull(v); return n === null ? "" : n; };
  const body = rows.filter((row) => inSpan(row, from, to)).map((row) => {
    const { expected: e, received: r, diff } = row;
    return [
      r ? fmtDate(r.receivedDate) : "", r ? r.company : "", r ? r.currency : "", r ? num(r.receivedAmount) : "", r ? r.sender || "" : "", r ? qbText(r.qb) : "",
      e ? fmtDate(e.date) : "", (e ? e.customer : r.customer) || "", e ? e.currency : "", e ? num(e.expectedAmount) : "", e ? (e.proof ? "Yes" : "No") : "", enteredBy(row, repName), diff === null || diff === undefined ? "" : diff,
    ];
  });
  return { aoa: [groups, LEDGER_COLUMNS, ...body], merges, cols: [12, 9, 9, 15, 28, 24, 14, 34, 9, 15, 9, 14, 14].map((wch) => ({ wch })) };
}
