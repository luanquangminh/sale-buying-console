import { describe, expect, it } from "vitest";
import { extractJson, gtinValid, normalise, toNumber } from "../worker/ai/validate";

describe("toNumber", () => {
  it("handles thousands separators and decimal commas", () => {
    expect(toNumber("1,031.50")).toBe(1031.5);
    expect(toNumber("9,02")).toBe(9.02);
    expect(toNumber("1.031,50")).toBe(1031.5);
    expect(toNumber("20 cases")).toBe(20);
    expect(toNumber("£14.40")).toBe(14.4);
    expect(toNumber("")).toBe("");
    expect(toNumber(12)).toBe(12);
  });
});

describe("gtinValid", () => {
  it("accepts real EAN-13 / GTIN-14 codes and rejects a wrong check digit", () => {
    expect(gtinValid("4012824406711")).toBe(true);
    expect(gtinValid("5000168014920")).toBe(true);
    expect(gtinValid("05000168014913")).toBe(true);
    expect(gtinValid("4012824406712")).toBe(false);
    expect(gtinValid("12345")).toBe(false);
  });
});

describe("extractJson + normalise", () => {
  it("strips fences, coerces fields, drops totals rows and flags bad barcodes", () => {
    const raw = '```json\n{"documentNumber":"3200","currency":"gbp","lines":[' +
      '{"product":"Yogi Tea","ean":"EAN: 4012824406711","quantity":"20","rate":"9,02","vat":"0.0% Z"},' +
      '{"product":"Subtotal","quantity":"","rate":"2,963.70"},' +
      '{"product":"Heinz Beans","ean":"5000157024672","quantity":30,"rate":14.4}' +
      ']}\n```';
    const { parsed, warnings } = normalise(extractJson(raw));
    expect(parsed.documentNumber).toBe("3200");
    expect(parsed.currency).toBe("GBP");
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({ product: "Yogi Tea", ean: "4012824406711", quantity: 20, rate: 9.02, vat: "0.0% Z" });
    expect(warnings.some((w) => w.includes("Subtotal"))).toBe(true);
    expect(warnings.some((w) => w.includes("5000157024672"))).toBe(true);
  });

  it("throws on non-JSON replies", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("salvageJson via extractJson", () => {
  it("recovers complete lines from a reply cut off mid-string", () => {
    const cut = '{"documentNumber":"3200","party":"Acme Foods Ltd","incoterm":"Ex-Works","currency":"GBP","lines":[' +
      '{"product":"Yogi Tea","ean":"4012824406711","caseBarcode":"","pack":"6 x 17s","bbd":"02/2027","quantity":20,"rate":9.02,"vat":"0.0% Z"},' +
      '{"product":"McVities","ean":"5000168014920","caseBarcode":"","pack":"10 x 400g","bbd":"11/2026","quantity":50,"rate":20.63,"vat":"0.0% Z"},' +
      '{"product":"Heinz Beans","ean":"5000157024671","caseBarcode":"","pack":"24 x 415g","bbd":"06/2028","quantity":30,"rate":14.4,"vat":"0.0% Z Z Z Z Z Z';
    const obj = extractJson(cut) as any;
    expect(obj.documentNumber).toBe("3200");
    expect(obj.currency).toBe("GBP");
    expect(obj.lines).toHaveLength(2);
    expect(obj.lines[1].product).toBe("McVities");
  });
});

describe("normaliseVat", () => {
  it("maps document VAT text onto the app's options", async () => {
    const { normaliseVat } = await import("../worker/ai/validate");
    expect(normaliseVat("20.0%")).toBe("20.0% S");
    expect(normaliseVat("20%")).toBe("20.0% S");
    expect(normaliseVat("5")).toBe("5.0%");
    expect(normaliseVat("0.0% Z")).toBe("0.0% Z");
    expect(normaliseVat("Zero rated")).toBe("0.0% Z");
    expect(normaliseVat("")).toBe("");
  });
});
