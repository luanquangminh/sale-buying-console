/* Dates are stored as ISO `yyyy-mm-dd`; the UI shows and accepts `dd/mm/yyyy`. */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_RE = /^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\s*$/;
const BARE_RE = /^\s*(\d{2})(\d{2})(\d{4})\s*$/; // ddmmyyyy, for numeric keypads without a "/" key

const pad = (n) => String(n).padStart(2, "0");

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** ISO date (or ISO datetime) → `dd/mm/yyyy`. Anything else comes back unchanged; empty → "". */
export function fmtDate(value) {
  if (!value) return "";
  const m = ISO_RE.exec(String(value));
  if (!m) return String(value);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** `dd/mm/yyyy` (also d/m/yy, dots or dashes, bare ddmmyyyy, or ISO) → ISO. "" → "". Invalid → null. */
export function parseDmy(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  const iso = ISO_RE.exec(s);
  if (iso && s.length === 10) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return validYmd(y, m, d) ? s : null;
  }
  const m = DMY_RE.exec(s) || BARE_RE.exec(s);
  if (!m) return null;
  const [d, mo] = [Number(m[1]), Number(m[2])];
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (!validYmd(y, mo, d)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
