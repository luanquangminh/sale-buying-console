import { describe, expect, it } from "vitest";
import { acknowledged, changeSinceSent, lineChange, removedSinceSent, stampSent } from "../src/sentMark.js";

const NOW = "2026-09-28T10:00:00.000Z";
const LINES = [
  { id: "L-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100 },
  { id: "L-jam", product: "Bonne Maman Jam", ean: "3045320001570", quantity: 40 },
];
const linesOf = (lines: any[]) => () => lines;
const ref = (extra: Record<string, unknown> = {}) => ({ pfiId: "pfi-1", saleId: "sale-1", pfiProductId: "L-tea", allocatedQty: 100, orderStatus: "ordered", ...extra });
const po = (sentStatus: string, refs: any[]) => ({ id: "po-1", poNo: "2480", sentStatus, products: [{ id: "row-1", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100, linkedPfiRefs: refs }] });
const refsOf = (p: any) => p.products[0].linkedPfiRefs;

describe("stampSent", () => {
  it("remembers each linked PFI line as it stands when the PO is saved as sent", () => {
    const out = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    expect(refsOf(out)[0].sent).toEqual({ lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW });
    const jam = stampSent(po("sent", [ref({ pfiProductId: "L-jam" })]), linesOf(LINES), NOW);
    expect(refsOf(jam)[0].sent).toMatchObject({ lineId: "L-jam", qty: 40, index: 1 });
  });
  it("keeps what was remembered on later saves, whatever the line says now", () => {
    const first = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    const later = stampSent(first, linesOf([{ ...LINES[0], quantity: 120 }, LINES[1]]), "2026-09-30T10:00:00.000Z");
    expect(refsOf(later)[0].sent).toEqual({ lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW });
    expect(later).toBe(first); // nothing to write
  });
  it("keeps it when the line has been deleted, so the removal can be shown", () => {
    const first = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    const later = stampSent(first, linesOf([LINES[1]]), "2026-09-30T10:00:00.000Z");
    expect(refsOf(later)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100 });
  });
  it("starts again when the buyer points the row at another line", () => {
    const first = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    const moved = { ...first, products: [{ ...first.products[0], linkedPfiRefs: [{ ...refsOf(first)[0], pfiProductId: "L-jam" }] }] };
    expect(refsOf(stampSent(moved, linesOf(LINES), "2026-09-30T10:00:00.000Z"))[0].sent).toEqual({ lineId: "L-jam", qty: 40, product: "Bonne Maman Jam", index: 1, at: "2026-09-30T10:00:00.000Z" });
  });
  it("covers a link added after the PO was sent, and a link matched automatically", () => {
    const out = stampSent(po("sent", [ref({ pfiProductId: undefined })]), linesOf(LINES), NOW); // matched by EAN
    expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100 });
  });
  it("remembers nothing while the PO is not sent, and forgets when it goes back to not sent", () => {
    const draft = po("not_sent", [ref()]);
    expect(stampSent(draft, linesOf(LINES), NOW)).toBe(draft);
    const sent = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    const back = stampSent({ ...sent, sentStatus: "not_sent" }, linesOf(LINES), NOW);
    expect(refsOf(back)[0]).not.toHaveProperty("sent");
  });
  it("leaves a row that matches no line alone", () => {
    const out = stampSent(po("sent", [ref({ pfiProductId: "" }), ref({ pfiId: "pfi-2", pfiProductId: "L-gone" })]), linesOf(LINES), NOW);
    expect(refsOf(out).every((r: any) => !("sent" in r))).toBe(true);
  });
});

describe("changeSinceSent (a PO row against its PFI line)", () => {
  const stamped = (extra: Record<string, unknown> = {}) => ref({ sent: { lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW }, ...extra });
  it("says nothing while the line is as it was", () => {
    expect(changeSinceSent(stamped(), LINES)).toBe(null);
    expect(changeSinceSent(stamped(), [{ ...LINES[0], quantity: "100" }])).toBe(null); // typed as text, same number
  });
  it("reports a quantity changed by the sale", () => {
    expect(changeSinceSent(stamped(), [{ ...LINES[0], quantity: 120 }])).toEqual({ kind: "changed", product: "Yogi Tea Classic Chai", from: 100, to: 120 });
    expect(changeSinceSent(stamped(), [{ ...LINES[0], quantity: "" }])).toEqual({ kind: "changed", product: "Yogi Tea Classic Chai", from: 100, to: 0 });
  });
  it("reports a line the sale removed, under the name it had", () => {
    expect(changeSinceSent(stamped(), [LINES[1]])).toEqual({ kind: "removed", product: "Yogi Tea Classic Chai" });
  });
  it("uses the line's current name for a change, the remembered one for a removal", () => {
    expect(changeSinceSent(stamped(), [{ ...LINES[0], product: "Yogi Tea Chai 17 bags", quantity: 90 }])).toMatchObject({ kind: "changed", product: "Yogi Tea Chai 17 bags" });
  });
  it("is silent for a row with nothing remembered, and for a row the buyer marked Removed", () => {
    expect(changeSinceSent(ref(), [{ ...LINES[0], quantity: 120 }])).toBe(null);
    expect(changeSinceSent(stamped({ orderStatus: "removed" }), [{ ...LINES[0], quantity: 120 }])).toBe(null);
    expect(changeSinceSent(stamped({ orderStatus: "removed" }), [])).toBe(null);
  });
});

describe("acknowledged", () => {
  it("takes the line as it is now as the new reference", () => {
    const r = ref({ sent: { lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW } });
    const next = acknowledged(r.sent, [{ ...LINES[0], quantity: 120, product: "Yogi Tea Chai" }], "2026-09-30T10:00:00.000Z");
    expect(next).toEqual({ lineId: "L-tea", qty: 120, product: "Yogi Tea Chai", index: 0, at: "2026-09-30T10:00:00.000Z" });
    expect(changeSinceSent({ ...r, sent: next }, [{ ...LINES[0], quantity: 120 }])).toBe(null);
  });
  it("cannot acknowledge a line that is gone", () => {
    expect(acknowledged({ lineId: "L-tea", qty: 100, product: "x", index: 0, at: NOW }, [LINES[1]], NOW)).toBe(null);
  });
});

describe("the PFI side", () => {
  const sent = (lineId: string, qty: number, product: string, index: number) => ({ lineId, qty, product, index, at: NOW });
  const receipt = (extra: Record<string, unknown>) => ({ poId: "po-1", poNo: "2480", poLineId: "row-1", pfiId: "pfi-1", orderStatus: "ordered", quantity: 100, ...extra });
  it("flags a line whose quantity differs from what a sent PO remembers", () => {
    const line = { id: "L-tea", product: "Yogi Tea", quantity: 120, receipts: [receipt({ sent: sent("L-tea", 100, "Yogi Tea", 0) })] };
    expect(lineChange(line)).toEqual({ from: 100, to: 120, pos: ["2480"] });
    expect(lineChange({ ...line, quantity: 100 })).toBe(null);
    expect(lineChange({ ...line, receipts: [receipt({})] })).toBe(null); // PO not sent: nothing remembered
    expect(lineChange({ ...line, receipts: [receipt({ sent: sent("L-tea", 100, "Yogi Tea", 0), orderStatus: "removed" })] })).toBe(null);
    expect(lineChange({ id: "L-x", product: "x", quantity: 5 })).toBe(null);
  });
  it("names every sent PO that still holds the older quantity", () => {
    const line = { id: "L-tea", product: "Yogi Tea", quantity: 120, receipts: [
      receipt({ sent: sent("L-tea", 100, "Yogi Tea", 0) }),
      receipt({ poId: "po-2", poNo: "2481", sent: sent("L-tea", 120, "Yogi Tea", 0) }), // already acknowledged
      receipt({ poId: "po-3", poNo: "2490", sent: sent("L-tea", 100, "Yogi Tea", 0) }),
    ] };
    expect(lineChange(line)).toEqual({ from: 100, to: 120, pos: ["2480", "2490"] });
  });
  it("lists the lines removed after a PO was sent, with the place they had", () => {
    const pfi = {
      products: [{ id: "L-jam", product: "Jam", quantity: 40, receipts: [] }],
      unmatchedReceipts: [
        receipt({ sent: sent("L-tea", 100, "Yogi Tea Classic Chai", 0) }),
        receipt({ poId: "po-2", poNo: "2481", poLineId: "row-9", sent: sent("L-tea", 100, "Yogi Tea Classic Chai", 0) }), // a second PO for the same line
        receipt({ poLineId: "row-2", sent: sent("L-rice", 30, "Rice 1kg", 2) }),
        receipt({ poLineId: "row-3" }), // never matched a line: not a removal
        receipt({ poLineId: "row-4", sent: sent("L-beans", 10, "Beans", 3), orderStatus: "removed" }), // the buyer dealt with it
      ],
    };
    expect(removedSinceSent(pfi)).toEqual([
      { lineId: "L-tea", product: "Yogi Tea Classic Chai", index: 0, pos: ["2480", "2481"] },
      { lineId: "L-rice", product: "Rice 1kg", index: 2, pos: ["2480"] },
    ]);
    expect(removedSinceSent({ products: [] })).toEqual([]);
  });
});
