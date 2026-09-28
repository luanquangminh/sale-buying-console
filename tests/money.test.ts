import { describe, expect, it } from "vitest";
import { lineVat, orderTotals, vatOption, vatRate } from "../src/money.js";

describe("vatOption / vatRate", () => {
  it("keeps the three choices of the VAT column", () => {
    expect(vatOption("0.0% Z")).toBe("0.0% Z");
    expect(vatOption("5.0%")).toBe("5.0%");
    expect(vatOption("20.0% S")).toBe("20.0% S");
    expect([vatRate("0.0% Z"), vatRate("5.0%"), vatRate("20.0% S")]).toEqual([0, 5, 20]);
  });
  it("reads what imports and documents write", () => {
    expect(vatOption("20%")).toBe("20.0% S");
    expect(vatOption("20")).toBe("20.0% S");
    expect(vatOption(20)).toBe("20.0% S");
    expect(vatOption(0.2)).toBe("20.0% S"); // percentage cell of a spreadsheet
    expect(vatOption("0.05")).toBe("5.0%");
    expect(vatOption("5,0 %")).toBe("5.0%");
    expect(vatOption("S")).toBe("20.0% S");
    expect(vatOption("Standard rate")).toBe("20.0% S");
    expect(vatOption("0")).toBe("0.0% Z"); // seven lines of the live data carry this
    expect(vatOption("Z")).toBe("0.0% Z");
  });
  it("falls back to the zero rate for anything else, so the total always matches the choice shown", () => {
    for (const v of ["", null, undefined, "exempt", "12.5%", "n/a"]) {
      expect(vatOption(v)).toBe("0.0% Z");
      expect(vatRate(v)).toBe(0);
    }
  });
});

describe("orderTotals", () => {
  const line = (amount: number | string, vat?: unknown) => ({ amount, vat });
  it("adds VAT line by line", () => {
    expect(orderTotals([line(100, "20.0% S"), line(50, "5.0%"), line(30, "0.0% Z")])).toEqual({ net: 180, vat: 22.5, total: 202.5 });
  });
  it("is unchanged for an order with no VAT", () => {
    expect(orderTotals([line(168, "0.0% Z"), line(9.6)])).toEqual({ net: 177.6, vat: 0, total: 177.6 });
  });
  it("matches the one live order that carries VAT", () => {
    expect(orderTotals([line(1124.1, "20.0% S")])).toEqual({ net: 1124.1, vat: 224.82, total: 1348.92 });
  });
  it("rounds each line to the penny and stays free of float noise", () => {
    expect(lineVat(line(0.33, "5.0%"))).toBe(0.02);
    expect(lineVat(line(1.005, "20.0% S"))).toBe(0.2);
    expect(orderTotals([line(0.1, "20.0% S"), line(0.2, "20.0% S")])).toEqual({ net: 0.3, vat: 0.06, total: 0.36 });
    expect(orderTotals([line(19.99, "20.0% S"), line(19.99, "20.0% S"), line(19.99, "20.0% S")])).toEqual({ net: 59.97, vat: 12, total: 71.97 });
  });
  it("copes with empty or unreadable amounts", () => {
    expect(orderTotals([])).toEqual({ net: 0, vat: 0, total: 0 });
    expect(orderTotals(undefined)).toEqual({ net: 0, vat: 0, total: 0 });
    expect(orderTotals([line("", "20.0% S"), line("abc", "5.0%"), line("12.50", "20.0% S")])).toEqual({ net: 12.5, vat: 2.5, total: 15 });
  });
});
