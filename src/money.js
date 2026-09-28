/* Order money. A line's amount is net (cases × rate); VAT is added per line from the rate chosen on it. */

export const VAT_OPTIONS = ["0.0% Z", "5.0%", "20.0% S"];
const OPTION_RATE = { "0.0% Z": 0, "5.0%": 5, "20.0% S": 20 };

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What a document or a spreadsheet wrote in its VAT column, as a percentage: "20%", 0.2, "20.0% S", "S" → 20. */
function readRate(vat) {
  const text = String(vat ?? "").trim();
  const m = text.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (m) {
    const n = parseFloat(m[0]);
    return n > 0 && n < 1 ? round2(n * 100) : n; // a spreadsheet percentage cell arrives as a fraction
  }
  if (/^s\b|standard/i.test(text)) return 20;
  if (/^r\b|reduced/i.test(text)) return 5;
  return 0;
}

/** The VAT choice shown for a line: one of VAT_OPTIONS, the zero rate when the value is none of them. */
export function vatOption(vat) {
  const rate = readRate(vat);
  return VAT_OPTIONS.find((o) => OPTION_RATE[o] === rate) || VAT_OPTIONS[0];
}

/** VAT percentage applied to a line: always the one of the choice shown for it. */
export const vatRate = (vat) => OPTION_RATE[vatOption(vat)];

/** VAT on one line, rounded to the penny. */
export const lineVat = (p) => round2((Number(p.amount) || 0) * vatRate(p.vat) / 100);

/** Subtotal (net), VAT and total (what is owed) of a list of lines. */
export function orderTotals(products) {
  const net = round2((products || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0));
  const vat = round2((products || []).reduce((acc, p) => acc + lineVat(p), 0));
  return { net, vat, total: round2(net + vat) };
}
