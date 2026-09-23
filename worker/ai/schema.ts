/* Shared contract for document parsing: instruction text (the artifact's, plus tested clarifications) and the JSON schema. */

export const INSTRUCTION = [
  "Read this proforma / estimate / purchase order and return its line items.",
  "Respond with JSON only — no prose, no markdown fences.",
  "Shape:",
  '{"documentNumber":"","party":"","incoterm":"","currency":"","lines":[{"product":"","ean":"","caseBarcode":"","pack":"","bbd":"","quantity":0,"rate":0,"vat":""}]}',
  "Rules: product is the Product/Service name only. ean and caseBarcode are the 8 to 14 digit codes from the Description block (empty string if the document shows the label with no value).",
  "pack is the text after 'Pack:' or 'Case size:'. bbd is the BBD shown for that line, else empty.",
  "quantity and rate are plain numbers with no currency symbol or thousands separator. vat is the VAT text such as '0.0% Z'.",
  "party is the buyer's company name only. currency is the ISO code (GBP, USD or EUR) inferred from the totals.",
  "Include every product line in the document. Do not include subtotal, VAT or total rows as lines. Do not invent values that are not in the document. Keep every string short.",
].join(" ");

export const TEXT_NOTE =
  "The document text below was extracted page by page, top to bottom. Within a line, ' | ' separates table columns. A wrapped cell continues on the next line without a row number; a product's EAN / Case Barcode may appear on the lines after its name.";

const str = (maxLength: number) => ({ type: "string", maxLength }) as const;

// Every field is required and length-capped on purpose: with guided JSON decoding the
// tested models skip optional fields and can run on inside open-ended strings.
export const LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    product: str(120),
    ean: str(14),
    caseBarcode: str(14),
    pack: str(40),
    bbd: str(20),
    quantity: { type: "number" },
    rate: { type: "number" },
    vat: str(12),
  },
  required: ["product", "ean", "caseBarcode", "pack", "bbd", "quantity", "rate", "vat"],
} as const;

export const DOCUMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentNumber: str(40),
    party: str(80),
    incoterm: str(40),
    currency: str(3),
    lines: { type: "array", maxItems: 80, items: LINE_SCHEMA },
  },
  required: ["documentNumber", "party", "incoterm", "currency", "lines"],
} as const;

export type ParsedLine = {
  product: string; ean: string; caseBarcode: string; pack: string; bbd: string;
  quantity: number | ""; rate: number | ""; vat: string;
};
export type ParsedDocument = {
  documentNumber: string; party: string; incoterm: string; currency: string; lines: ParsedLine[];
};
