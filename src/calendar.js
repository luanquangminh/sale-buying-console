/* Month-grid helpers for Warehouse's Space. Dates are ISO yyyy-mm-dd; weeks start on Monday. */

const DAY_MS = 86_400_000;
const ymd = (d) => d.toISOString().slice(0, 10);

/** Today's date as the browser's local calendar sees it (not UTC). */
export function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;

export function addMonths(iso, n) {
  const [y, m] = iso.split("-").map(Number);
  return ymd(new Date(Date.UTC(y, m - 1 + n, 1)));
}

export function monthLabel(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The 42 days (6 rows × Mon–Sun) that show a month, as ISO dates. */
export function monthGrid(iso) {
  const [y, m] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = first.getTime() - offset * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => ymd(new Date(start + i * DAY_MS)));
}

export const inMonth = (iso, monthIso) => iso.slice(0, 7) === monthIso.slice(0, 7);
