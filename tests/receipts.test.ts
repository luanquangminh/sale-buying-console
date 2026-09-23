import { describe, expect, it } from "vitest";
import { applyReceipts, matchPfiLine, stripDerived } from "../src/receipts.js";

const lines = [
  { id: "L1", product: "Yogi Tea Organic Bags Classic Chai 37.4g", ean: "4012824406711", caseBarcode: "4012824436718" },
  { id: "L2", product: "McVities Family Circle 400g", ean: "5000168014920", caseBarcode: "05000168014913" },
  { id: "L3", product: "Yogi Tea Organic Bags Classic Chai 37.4g", ean: "", caseBarcode: "" },
];

describe("matchPfiLine", () => {
  it("prefers the explicit line id", () => {
    expect(matchPfiLine(lines, { pfiProductId: "L3" }, { product: "Yogi Tea Organic Bags Classic Chai 37.4g", ean: "4012824406711" })).toBe("L3");
  });
  it("leaves a row unmatched when its explicit line was deleted, rather than re-routing it", () => {
    expect(matchPfiLine(lines, { pfiProductId: "gone" }, { product: "x", ean: "5000168014920" })).toBeNull();
  });
  it("matches by EAN, then case barcode, then normalised name", () => {
    expect(matchPfiLine(lines, {}, { product: "Different name", ean: "5000168014920" })).toBe("L2");
    expect(matchPfiLine(lines, {}, { product: "Different name", caseBarcode: "05000168014913" })).toBe("L2");
    expect(matchPfiLine(lines, {}, { product: "  MCVITIES family-circle 400G " })).toBe("L2");
  });
  it('treats "" as an explicit "no line" and null/undefined as automatic', () => {
    expect(matchPfiLine(lines, { pfiProductId: "" }, { product: "x", ean: "5000168014920" })).toBeNull();
    expect(matchPfiLine(lines, { pfiProductId: null }, { product: "x", ean: "5000168014920" })).toBe("L2");
    expect(matchPfiLine(lines, {}, { product: "x", ean: "5000168014920" })).toBe("L2");
  });
  it("returns null when nothing matches", () => {
    expect(matchPfiLine(lines, {}, { product: "Happy Hippo Cocoa Cream 5pk 20.7g", ean: "40084008" })).toBeNull();
    expect(matchPfiLine([], {}, { product: "anything" })).toBeNull();
  });
});

describe("applyReceipts", () => {
  const po = {
    id: "PO1", poNo: "4500",
    products: [
      { id: "P1", product: "Yogi Tea Organic Bags Classic Chai 37.4g", ean: "4012824406711", quantity: 20, orderStatus: "ordered",
        linkedPfiRefs: [{ pfiId: "F1", saleId: "S1", allocatedQty: 20, receivedQty: 18, orderStatus: "received" }] },
      { id: "P2", product: "Happy Hippo Cocoa Cream 5pk", ean: "", quantity: 10, orderStatus: "ordered",
        linkedPfiRefs: [{ pfiId: "F1", saleId: "S1", allocatedQty: 10, receivedQty: "", orderStatus: "ordered" }] },
    ],
  };
  const pfisBySale = { S1: [{ id: "F1", pfiNo: "3200", products: lines.map((l) => ({ ...l, quantity: 20 })) }] };

  it("attaches each PO row to one line and lists the rest as unmatched", () => {
    const out = applyReceipts(pfisBySale, [po]);
    const pfi = out.S1[0];
    expect(pfi.products[0].receipts).toHaveLength(1); // L1 via EAN
    expect(pfi.products[2].receipts).toHaveLength(0); // duplicate name, not double-counted
    expect(pfi.products[0].receipts[0]).toMatchObject({ poNo: "4500", quantity: 20, receivedQuantity: 18, orderStatus: "received", poProduct: "Yogi Tea Organic Bags Classic Chai 37.4g" });
    expect(pfi.unmatchedReceipts).toHaveLength(1);
    expect(pfi.unmatchedReceipts[0]).toMatchObject({ poLineId: "P2", poProduct: "Happy Hippo Cocoa Cream 5pk" });
  });
  it("honours an explicit line id over the EAN match", () => {
    const po2 = { ...po, products: [{ ...po.products[0], linkedPfiRefs: [{ ...po.products[0].linkedPfiRefs[0], pfiProductId: "L3" }] }] };
    const pfi = applyReceipts(pfisBySale, [po2]).S1[0];
    expect(pfi.products[2].receipts).toHaveLength(1);
    expect(pfi.products[0].receipts).toHaveLength(0);
  });
  it("leaves untouched PFIs with empty receipts and no unmatched rows", () => {
    const pfi = applyReceipts({ S1: [{ id: "F9", products: [{ id: "x", product: "a" }] }] }, [po]).S1[0];
    expect(pfi.products[0].receipts).toEqual([]);
    expect(pfi.unmatchedReceipts).toEqual([]);
  });
});

describe("stripDerived", () => {
  it("drops receipts and unmatchedReceipts only", () => {
    const pfi = { id: "F1", pfiNo: "1", unmatchedReceipts: [{}], products: [{ id: "L1", product: "a", receipts: [{}] }] };
    expect(stripDerived(pfi)).toEqual({ id: "F1", pfiNo: "1", products: [{ id: "L1", product: "a" }] });
  });
});
