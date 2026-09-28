import { describe, expect, it } from "vitest";
import { allocatedCases, lineCover, poShortages } from "../src/allocation.js";

// A PFI as the PO screen knows it: its lines, each with the cases the saved POs already give it.
const receipt = (poId: string, quantity: number | string, orderStatus = "ordered") => ({ poId, quantity, orderStatus });
const pfi = (lines: any[]) => ({ pfiId: "pfi-1", shortLabel: "PFI 3376", customerName: "Acme Foods Ltd", lines });
const tea = (quantity: number | string, receipts: any[] = []) => ({ id: "L-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity, receipts });
const jam = (quantity: number | string, receipts: any[] = []) => ({ id: "L-jam", product: "Bonne Maman Jam", ean: "3045320001570", quantity, receipts });

const ref = (extra: Record<string, unknown> = {}) => ({ pfiId: "pfi-1", saleId: "sale-1", pfiProductId: "L-tea", allocatedQty: "", orderStatus: "ordered", ...extra });
const row = (quantity: number | string, refs: any[], extra: Record<string, unknown> = {}) => ({ id: `row-${Math.random()}`, product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity, orderStatus: "ordered", linkedPfiRefs: refs, ...extra });
const po = (products: any[], id = "po-1") => ({ id, poNo: "2485", products });

describe("allocatedCases", () => {
  it("is what was typed for the PFI, or the whole row while nothing is typed", () => {
    expect(allocatedCases({ quantity: 100 }, { allocatedQty: 80 })).toBe(80);
    expect(allocatedCases({ quantity: 100 }, { allocatedQty: "80" })).toBe(80);
    expect(allocatedCases({ quantity: 100 }, { allocatedQty: 0 })).toBe(0);
    expect(allocatedCases({ quantity: 100 }, { allocatedQty: "" })).toBe(100);
    expect(allocatedCases({ quantity: "" }, {})).toBe(0);
  });
});

describe("lineCover", () => {
  it("reports how many cases a PFI line is short of", () => {
    expect(lineCover(pfi([tea(100)]), "L-tea", po([row(80, [ref({ allocatedQty: 80 })])])))
      .toEqual({ need: 100, here: 80, others: 0, allocated: 80, short: 20, over: 0 });
  });
  it("is covered when the allocation meets the order, and says by how much it goes over", () => {
    expect(lineCover(pfi([tea(100)]), "L-tea", po([row(100, [ref({ allocatedQty: 100 })])]))).toMatchObject({ allocated: 100, short: 0, over: 0 });
    expect(lineCover(pfi([tea(100)]), "L-tea", po([row(120, [ref({ allocatedQty: 120 })])]))).toMatchObject({ allocated: 120, short: 0, over: 20 });
  });
  it("adds up several rows of this PO and what the other POs already give the line", () => {
    const line = tea(100, [receipt("po-2", 30), receipt("po-3", 10)]);
    const cover = lineCover(pfi([line]), "L-tea", po([row(40, [ref({ allocatedQty: 40 })]), row(15, [ref({ allocatedQty: 15 })])]));
    expect(cover).toEqual({ need: 100, here: 55, others: 40, allocated: 95, short: 5, over: 0 });
  });
  it("counts this PO as it is being edited, not as it was last saved", () => {
    const line = tea(100, [receipt("po-1", 100)]); // saved: this PO gave 100
    expect(lineCover(pfi([line]), "L-tea", po([row(100, [ref({ allocatedQty: 60 })])]))).toMatchObject({ here: 60, others: 0, short: 40 });
  });
  it("leaves removed rows out, here and on the other POs", () => {
    const line = tea(100, [receipt("po-2", 50, "removed"), receipt("po-3", 20)]);
    const cover = lineCover(pfi([line]), "L-tea", po([row(30, [ref({ allocatedQty: 30 })]), row(50, [ref({ allocatedQty: 50, orderStatus: "removed" })])]));
    expect(cover).toMatchObject({ here: 30, others: 20, allocated: 50, short: 50 });
  });
  it("follows the line the row points at, by id or by the automatic match", () => {
    const lines = [tea(100), jam(40)];
    const byId = po([row(40, [ref({ pfiProductId: "L-jam", allocatedQty: 25 })])]);
    expect(lineCover(pfi(lines), "L-jam", byId)).toMatchObject({ need: 40, here: 25, short: 15 });
    expect(lineCover(pfi(lines), "L-tea", byId)).toMatchObject({ need: 100, here: 0, short: 100 });
    const auto = po([row(70, [ref({ pfiProductId: undefined, allocatedQty: 70 })])]); // matched by EAN
    expect(lineCover(pfi(lines), "L-tea", auto)).toMatchObject({ here: 70, short: 30 });
  });
  it("ignores rows linked to another PFI", () => {
    expect(lineCover(pfi([tea(100)]), "L-tea", po([row(90, [ref({ pfiId: "pfi-9", allocatedQty: 90 })])]))).toMatchObject({ here: 0, short: 100 });
  });
  it("has nothing to say when the line is unknown or has no quantity", () => {
    expect(lineCover(pfi([tea(100)]), "L-gone", po([]))).toBe(null);
    expect(lineCover(pfi([tea("")]), "L-tea", po([]))).toBe(null);
    expect(lineCover(pfi([tea(0)]), "L-tea", po([]))).toBe(null);
  });
  it("stays free of float noise", () => {
    expect(lineCover(pfi([tea(0.3)]), "L-tea", po([row(1, [ref({ allocatedQty: 0.1 })]), row(1, [ref({ allocatedQty: 0.1 })])]))).toMatchObject({ allocated: 0.2, short: 0.1 });
  });
});

describe("poShortages", () => {
  it("lists each PFI line this PO leaves short, once, with the cases missing", () => {
    const options = [
      pfi([tea(100, [receipt("po-2", 10)]), jam(40)]),
      { pfiId: "pfi-2", shortLabel: "PFI 3380", customerName: "Tema Wholesale", lines: [{ id: "M-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 50, receipts: [] }] },
    ];
    const draft = po([
      row(120, [ref({ allocatedQty: 60 }), { pfiId: "pfi-2", saleId: "sale-2", pfiProductId: "M-tea", allocatedQty: 50, orderStatus: "ordered" }]),
      row(10, [ref({ allocatedQty: 10 })]), // a second row for the same line
      row(40, [ref({ pfiProductId: "L-jam", allocatedQty: 40 })], { product: "Bonne Maman Jam", ean: "3045320001570" }),
    ]);
    expect(poShortages(draft, options)).toEqual([
      { pfiId: "pfi-1", lineId: "L-tea", pfiLabel: "PFI 3376", customerName: "Acme Foods Ltd", product: "Yogi Tea Classic Chai", need: 100, here: 70, others: 10, allocated: 80, short: 20, over: 0 },
    ]);
  });
  it("is empty when every linked line is covered, or nothing is linked", () => {
    expect(poShortages(po([row(100, [ref({ allocatedQty: 100 })])]), [pfi([tea(100)])])).toEqual([]);
    expect(poShortages(po([row(100, [])]), [pfi([tea(100)])])).toEqual([]);
    expect(poShortages(po([]), [])).toEqual([]);
  });
  it("skips removed rows and rows that match no line", () => {
    const draft = po([
      row(10, [ref({ allocatedQty: 10, orderStatus: "removed" })]),
      row(10, [ref({ pfiProductId: "", allocatedQty: 10 })]),
      row(10, [ref({ pfiProductId: "L-deleted", allocatedQty: 10 })]),
    ]);
    expect(poShortages(draft, [pfi([tea(100)])])).toEqual([]);
  });
});
