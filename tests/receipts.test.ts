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
  describe("a PO that names the product more briefly than the PFI", () => {
    const pfi = [
      { id: "N", product: "Nutella Biscuits Tube T12 \n168g", ean: "", caseBarcode: "" },
      { id: "K", product: "Kendamil RTD Stage 1 6pk 250ml", ean: "", caseBarcode: "" },
      { id: "A", product: "Aptamil Comfort Baby Milk Powder From Birth 800g", ean: "8718117611942", caseBarcode: "8718117111947" },
      { id: "P1", product: "Pepsi Max Tropical NAS 330ml", ean: "4062139023776", caseBarcode: "04062139023769" },
      { id: "P2", product: "Pepsi Max Cherry NAS 330ml", ean: "87171259", caseBarcode: "04060800170255" },
      { id: "S", product: "Snickers Protein Bar 47g", ean: "5000159516211", caseBarcode: "05000159516204" },
    ];
    it("matches when the PO name is the start of one line's name", () => {
      expect(matchPfiLine(pfi, {}, { product: "Nutella Biscuits Tube", ean: "8000500310397", caseBarcode: "8000500310502" })).toBe("N");
      expect(matchPfiLine(pfi, {}, { product: "Kendamil RTD Stage 1", ean: "", caseBarcode: "" })).toBe("K");
    });
    it("works the other way round too, the PFI being the brief one", () => {
      expect(matchPfiLine([{ id: "X", product: "Kendamil RTD Stage 1", ean: "" }], {}, { product: "Kendamil RTD Stage 1 6pk 250ml" })).toBe("X");
    });
    it("does not match when a code on both sides says they differ", () => {
      expect(matchPfiLine(pfi, {}, { product: "Aptamil Comfort Baby Milk Powder From Birth", ean: "5051594006850", caseBarcode: "5051594006973" })).toBeNull();
    });
    it("takes a leading zero on a case barcode as no difference", () => {
      const line = [{ id: "Z", product: "Fanta Lemon 330ml Can", ean: "", caseBarcode: "05017726153281" }];
      expect(matchPfiLine(line, {}, { product: "Fanta Lemon 330ml", ean: "", caseBarcode: "5017726153281x" })).toBeNull(); // a real difference
      expect(matchPfiLine([{ id: "Z", product: "Fanta Lemon 330ml Can", ean: "5449000006004", caseBarcode: "" }], {}, { product: "Fanta Lemon 330ml", ean: "05449000006004" })).toBe("Z");
    });
    it("does not guess between two lines, nor between products that only share words", () => {
      expect(matchPfiLine(pfi, {}, { product: "Pepsi Max", ean: "" })).toBeNull(); // Tropical or Cherry?
      expect(matchPfiLine(pfi, {}, { product: "Pepsi Max 330ml", ean: "87170146" })).toBeNull(); // not the start of either name
      expect(matchPfiLine(pfi, {}, { product: "Snickers Peanut Butter Protein Bar 47g", ean: "5056357900857" })).toBeNull();
    });
    it("needs at least two words, and whole words", () => {
      expect(matchPfiLine(pfi, {}, { product: "Nutella" })).toBeNull();
      expect(matchPfiLine(pfi, {}, { product: "Nutella Bisc" })).toBeNull();
    });
    it("keeps the exact rules first", () => {
      const both = [{ id: "long", product: "Nutella Biscuits Tube T12 168g", ean: "" }, { id: "exact", product: "Nutella Biscuits Tube", ean: "" }];
      expect(matchPfiLine(both, {}, { product: "Nutella Biscuits Tube" })).toBe("exact");
      expect(matchPfiLine(both, { pfiProductId: "" }, { product: "Nutella Biscuits Tube" })).toBeNull(); // the buyer said: no line
    });
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
