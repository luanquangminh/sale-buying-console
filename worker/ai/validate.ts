import type { ParsedDocument, ParsedLine } from "./schema";

/** Strip fences and pull the first JSON object out of a model reply. */
export function extractJson(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") throw new Error("Model returned no content");
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through to salvage */ }
  }
  const salvaged = salvageJson(cleaned);
  if (salvaged) return salvaged;
  throw new Error("Model reply was not JSON");
}

/**
 * Recover what can be recovered from a reply cut off mid-way (output cap or a runaway string):
 * header fields that closed properly plus every complete object inside "lines": [ ... ].
 */
export function salvageJson(text: string): Record<string, unknown> | null {
  const linesAt = text.indexOf('"lines"');
  const out: Record<string, unknown> = {};
  const header = linesAt >= 0 ? text.slice(0, linesAt) : text;
  for (const key of ["documentNumber", "party", "incoterm", "currency"]) {
    const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(header);
    if (m) out[key] = m[1];
  }
  const lines: unknown[] = [];
  if (linesAt >= 0) {
    const arr = text.indexOf("[", linesAt);
    let i = arr + 1;
    while (i > 0 && i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let depth = 0; let inStr = false; let close = -1;
      for (let j = open; j < text.length; j++) {
        const ch = text[j];
        if (inStr) { if (ch === "\\\\") j++; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { close = j; break; } }
        else if (ch === "]" && depth === 0) break;
      }
      if (close < 0) break;
      try { lines.push(JSON.parse(text.slice(open, close + 1))); } catch { /* skip broken object */ }
      i = close + 1;
    }
  }
  if (!lines.length && !Object.keys(out).length) return null;
  out.lines = lines;
  return out;
}

/** "1,031.50" → 1031.5, "9,02" → 9.02, "20 cases" → 20, "" → "". */
export function toNumber(v: unknown): number | "" {
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v !== "string") return "";
  let s = v.replace(/[^\d.,-]/g, "");
  if (!s) return "";
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const digits = (v: unknown) => str(v).replace(/\D/g, "");

/** EAN-8 / EAN-13 / GTIN-14 mod-10 check digit. */
export function gtinValid(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const body = code.slice(0, -1); const check = Number(code.slice(-1));
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === check;
}

const VAT_OPTIONS = ["0.0% Z", "5.0%", "20.0% S"];
/** Map whatever the document says ("20%", "20.0", "S 20.0%", "zero") onto the app's VAT options. */
export function normaliseVat(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (VAT_OPTIONS.includes(s)) return s;
  const n = Number((s.match(/\d+(?:[.,]\d+)?/) || [""])[0].replace(",", "."));
  if (Number.isFinite(n) && s.match(/\d/)) {
    if (n >= 15) return "20.0% S";
    if (n >= 3) return "5.0%";
    return "0.0% Z";
  }
  if (/zero|exempt|\bz\b/i.test(s)) return "0.0% Z";
  return s;
}

const TOTAL_WORDS = /^(sub\s*-?total|total|vat|tax|grand total|amount due|balance|discount|shipping|freight|deposit)\b/i;

export type Validation = { parsed: ParsedDocument; warnings: string[] };

/** Coerce a raw model object into the UI's shape and collect warnings. */
export function normalise(raw: unknown): Validation {
  const warnings: string[] = [];
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
  const lines: ParsedLine[] = [];
  for (const item of rawLines) {
    const l = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const product = str(l.product);
    if (!product) continue;
    if (TOTAL_WORDS.test(product) && !str(l.ean)) { warnings.push(`Dropped "${product}" (looks like a totals row)`); continue; }
    const ean = digits(l.ean); const caseBarcode = digits(l.caseBarcode);
    if (ean && !gtinValid(ean)) warnings.push(`EAN ${ean} on "${product}" fails its check digit`);
    if (caseBarcode && !gtinValid(caseBarcode)) warnings.push(`Case barcode ${caseBarcode} on "${product}" fails its check digit`);
    lines.push({
      product, ean, caseBarcode, pack: str(l.pack), bbd: str(l.bbd),
      quantity: toNumber(l.quantity), rate: toNumber(l.rate), vat: normaliseVat(str(l.vat)),
    });
  }
  const parsed: ParsedDocument = {
    documentNumber: str(obj.documentNumber).replace(/^(?:(?:pfi|po|invoice|proforma|estimate|no\.?|number|#)[\s.:#-]*)+/i, "").trim(), party: str(obj.party), incoterm: str(obj.incoterm),
    currency: str(obj.currency).toUpperCase().slice(0, 3), lines,
  };
  if (lines.length === 0) warnings.push("No product lines were found");
  return { parsed, warnings };
}
