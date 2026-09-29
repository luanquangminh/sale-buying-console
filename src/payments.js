/* Customer Balance (the tab first named Payment tracking): invoices to collect, by customer, and where each stands against its due date. */

export const PAY_STATUSES = [
  { value: "not_paid", label: "Have not paid" },
  { value: "proof", label: "Received proof" },
  { value: "received", label: "Received" },
];
export const PAY_STATUS_LABEL = Object.fromEntries(PAY_STATUSES.map((s) => [s.value, s.label]));
export const PAY_STATUS_TONE = { not_paid: "grey", proof: "amber", received: "green" };

/** Status of an invoice. Records saved before the status existed carry a Paid tick instead: ticked reads as Received. */
export function payStatus(row) {
  if (row && PAY_STATUS_LABEL[row.status]) return row.status;
  return row && row.paid ? "received" : "not_paid";
}

/** An invoice is outstanding until the money is received; a proof of payment does not settle it. */
export const isOutstanding = (row) => payStatus(row) !== "received";

const dayNumber = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : null;
};

/** received → "paid"; no due date → "open"; due date already passed → "overdue" with the days late; otherwise "due" with the days left (0 = today). */
export function dueState(row, todayIso) {
  if (!isOutstanding(row)) return { state: "paid", days: 0 };
  const due = dayNumber(row.dueDate);
  const today = dayNumber(todayIso);
  if (due === null || today === null) return { state: "open", days: 0 };
  return due < today ? { state: "overdue", days: today - due } : { state: "due", days: due - today };
}

export function dueLabel(row, todayIso) {
  const { state, days } = dueState(row, todayIso);
  if (state === "paid") return "Settled";
  if (state === "open") return "No due date";
  if (state === "overdue") return `Overdue ${days} day${days === 1 ? "" : "s"}`;
  return days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
}

export const DUE_TONE = { paid: "green", overdue: "red", due: "gray", open: "gray" };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const addTo = (sums, currency, amount) => { sums[currency] = money((sums[currency] || 0) + amount); };

/**
 * One entry per customer, A → Z, whatever the case or the spaces the name was typed with. Each carries its
 * invoices in the order of the list, what is still outstanding and what was invoiced (per currency, as a
 * customer can be invoiced in more than one), and how many invoices are overdue or have a container on hold.
 */
export function groupByCustomer(rows, todayIso) {
  const groups = new Map();
  for (const row of rows || []) {
    const name = String(row.customer || "").trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, customer: name || "(no customer)", invoices: [], outstanding: {}, invoiced: {}, open: 0, overdue: 0, onHold: 0 });
    const g = groups.get(key);
    g.invoices.push(row);
    const currency = row.currency || "USD";
    addTo(g.invoiced, currency, num(row.amount));
    if (!isOutstanding(row)) continue;
    addTo(g.outstanding, currency, num(row.amount));
    g.open += 1;
    if (dueState(row, todayIso).state === "overdue") g.overdue += 1;
    if (row.onHold) g.onHold += 1;
  }
  return [...groups.values()].sort((a, b) => a.customer.localeCompare(b.customer, undefined, { sensitivity: "base", numeric: true }));
}
