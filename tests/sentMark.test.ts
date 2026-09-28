import { describe, expect, it } from "vitest";
import { acknowledged, changeSinceSent, changesOf, describeChanges, describeWas, isSent, lineChange, removedSinceSent, stampSent, stampSentAsOf } from "../src/sentMark.js";

const NOW = "2026-09-28T10:00:00.000Z";
const LINES = [
  { id: "L-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100 },
  { id: "L-jam", product: "Bonne Maman Jam", ean: "3045320001570", quantity: 40 },
];
const linesOf = (lines: any[]) => () => lines;
const ref = (extra: Record<string, unknown> = {}) => ({ pfiId: "pfi-1", saleId: "sale-1", pfiProductId: "L-tea", allocatedQty: 100, orderStatus: "ordered", ...extra });
const waiting = (extra: Record<string, unknown> = {}) => ref({ orderStatus: "sending_order", ...extra }); // a row whose order has not gone out
const po = (sentStatus: string, refs: any[]) => ({ id: "po-1", poNo: "2480", sentStatus, products: [{ id: "row-1", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100, linkedPfiRefs: refs }] });
const refsOf = (p: any) => p.products[0].linkedPfiRefs;

describe("stampSent", () => {
  it("remembers each linked PFI line as it stands when the PO is saved as sent", () => {
    const out = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW });
    const jam = stampSent(po("sent", [ref({ pfiProductId: "L-jam" })]), linesOf(LINES), NOW);
    expect(refsOf(jam)[0].sent).toMatchObject({ lineId: "L-jam", qty: 40, index: 1 });
  });
  it("keeps what was remembered on later saves, whatever the line says now", () => {
    const first = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    const later = stampSent(first, linesOf([{ ...LINES[0], quantity: 120, rate: 9 }, LINES[1]]), "2026-09-30T10:00:00.000Z");
    expect(refsOf(later)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW });
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
    expect(refsOf(stampSent(moved, linesOf(LINES), "2026-09-30T10:00:00.000Z"))[0].sent).toMatchObject({ lineId: "L-jam", qty: 40, product: "Bonne Maman Jam", index: 1, at: "2026-09-30T10:00:00.000Z" });
  });
  it("covers a link added after the PO was sent, and a link matched automatically", () => {
    const out = stampSent(po("sent", [ref({ pfiProductId: undefined })]), linesOf(LINES), NOW); // matched by EAN
    expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100 });
  });
  it("remembers nothing while the order has not gone out, and forgets when it goes back to that", () => {
    const draft = po("not_sent", [waiting()]);
    expect(stampSent(draft, linesOf(LINES), NOW)).toBe(draft);
    const notOrdered = po("not_sent", [ref({ orderStatus: "not_ordered" })]);
    expect(stampSent(notOrdered, linesOf(LINES), NOW)).toBe(notOrdered);
    const sent = stampSent(po("sent", [ref()]), linesOf(LINES), NOW);
    const back = stampSent({ ...sent, sentStatus: "not_sent", products: [{ ...sent.products[0], linkedPfiRefs: [{ ...refsOf(sent)[0], orderStatus: "sending_order" }] }] }, linesOf(LINES), NOW);
    expect(refsOf(back)[0]).not.toHaveProperty("sent");
  });
  it("counts a row set to Ordered, Received or Floor stock as sent, whatever the PO's Sent button says", () => {
    for (const status of ["ordered", "received", "floor_stock"]) {
      const out = stampSent(po("not_sent", [ref({ orderStatus: status })]), linesOf(LINES), NOW);
      expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100 });
    }
    const viaRow = { id: "po-1", poNo: "2485", sentStatus: "not_sent", products: [{ id: "row-1", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100, orderStatus: "ordered", linkedPfiRefs: [ref({ orderStatus: undefined })] }] };
    expect(refsOf(stampSent(viaRow, linesOf(LINES), NOW))[0].sent).toMatchObject({ qty: 100 }); // the status of the PO line, when the link has none of its own
  });
  it("judges each row of a PO on its own", () => {
    const mixed = { id: "po-1", poNo: "2485", sentStatus: "not_sent", products: [{ id: "row-1", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100, linkedPfiRefs: [ref({ orderStatus: "ordered" }), ref({ pfiId: "pfi-2", orderStatus: "sending_order" })] }] };
    const out = stampSent(mixed, linesOf(LINES), NOW);
    expect(refsOf(out)[0]).toHaveProperty("sent");
    expect(refsOf(out)[1]).not.toHaveProperty("sent");
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
    expect(changeSinceSent(stamped(), [{ ...LINES[0], quantity: 120 }])).toEqual({ kind: "changed", product: "Yogi Tea Classic Chai", from: 100, to: 120, changes: [{ field: "quantity", label: "quantity", from: 100, to: 120 }] });
    expect(changeSinceSent(stamped(), [{ ...LINES[0], quantity: "" }])).toMatchObject({ kind: "changed", product: "Yogi Tea Classic Chai", from: 100, to: 0 });
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
    expect(next).toMatchObject({ lineId: "L-tea", qty: 120, product: "Yogi Tea Chai", index: 0, at: "2026-09-30T10:00:00.000Z" });
    expect(changeSinceSent({ ...r, sent: next }, [{ ...LINES[0], quantity: 120, product: "Yogi Tea Chai" }])).toBe(null);
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
    expect(lineChange(line)).toMatchObject({ from: 100, to: 120, pos: ["2480"], changes: [{ field: "quantity", from: 100, to: 120 }] });
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
    expect(lineChange(line)).toMatchObject({ from: 100, to: 120, pos: ["2480", "2490"] });
    expect(lineChange(line)!.stale.map((r: any) => r.poNo)).toEqual(["2480", "2490"]); // the rows Seen has to settle
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

describe("stampSentAsOf (POs sent before links remembered anything)", () => {
  const THEN = "2026-09-28T16:45:00.000Z";
  const then = [{ id: "L-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", quantity: 100 }, { id: "L-jam", product: "Bonne Maman Jam", ean: "3045320001570", quantity: 40 }];
  it("takes the line as it stood then, so a change made since shows", () => {
    const now = [{ ...then[0], quantity: 120 }, then[1]];
    const out = stampSentAsOf(po("sent", [ref()]), linesOf(now), linesOf(then), THEN);
    expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: THEN });
    expect(changeSinceSent(refsOf(out)[0], now)).toMatchObject({ kind: "changed", product: "Yogi Tea Classic Chai", from: 100, to: 120 });
  });
  it("shows nothing for a line that has not changed", () => {
    const out = stampSentAsOf(po("sent", [ref()]), linesOf(then), linesOf(then), THEN);
    expect(changeSinceSent(refsOf(out)[0], then)).toBe(null);
  });
  it("remembers a line removed since then, so the removal shows", () => {
    const now = [then[1]];
    const out = stampSentAsOf(po("sent", [ref()]), linesOf(now), linesOf(then), THEN);
    expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-tea", qty: 100, index: 0 });
    expect(changeSinceSent(refsOf(out)[0], now)).toEqual({ kind: "removed", product: "Yogi Tea Classic Chai" });
    const auto = stampSentAsOf(po("sent", [ref({ pfiProductId: undefined })]), linesOf(now), linesOf(then), THEN); // matched by EAN then
    expect(changeSinceSent(refsOf(auto)[0], now)).toEqual({ kind: "removed", product: "Yogi Tea Classic Chai" });
  });
  it("starts a line added since then from what it is now", () => {
    const now = [...then, { id: "L-rice", product: "Rice 1kg", ean: "", quantity: 30 }];
    const out = stampSentAsOf(po("sent", [ref({ pfiProductId: "L-rice" })]), linesOf(now), linesOf(then), THEN);
    expect(refsOf(out)[0].sent).toMatchObject({ lineId: "L-rice", qty: 30, product: "Rice 1kg", index: 2, at: THEN });
    expect(stampSentAsOf(po("sent", [ref()]), linesOf(then), linesOf([]), THEN).products[0].linkedPfiRefs[0].sent).toMatchObject({ qty: 100 }); // the whole PFI is newer
  });
  it("covers a row set to Ordered on a PO that is not marked Sent", () => {
    const now = [{ ...then[0], quantity: 1500 }, then[1]];
    const out = stampSentAsOf(po("not_sent", [ref({ orderStatus: "ordered" })]), linesOf(now), linesOf(then), THEN);
    expect(changeSinceSent(refsOf(out)[0], now)).toMatchObject({ kind: "changed", product: "Yogi Tea Classic Chai", from: 100, to: 1500 });
  });
  it("leaves alone what already remembers, rows marked Removed, rows with no line, and rows whose order has not gone out", () => {
    const kept = { lineId: "L-tea", qty: 90, product: "Yogi Tea Classic Chai", index: 0, at: NOW, ean: "4012824406711", caseBarcode: "", caseSize: "", bbd: "", vat: "0.0% Z", rate: 0 };
    const already = po("sent", [ref({ sent: kept })]);
    expect(stampSentAsOf(already, linesOf(then), linesOf(then), THEN)).toBe(already);
    const removed = po("sent", [ref({ orderStatus: "removed" })]);
    expect(stampSentAsOf(removed, linesOf(then), linesOf(then), THEN)).toBe(removed);
    const noLine = po("sent", [ref({ pfiProductId: "" })]);
    expect(stampSentAsOf(noLine, linesOf(then), linesOf(then), THEN)).toBe(noLine);
    const notSent = po("not_sent", [waiting()]);
    expect(stampSentAsOf(notSent, linesOf(then), linesOf(then), THEN)).toBe(notSent);
  });
  it("changes nothing else on the PO", () => {
    const before = po("sent", [ref(), ref({ pfiId: "pfi-2", pfiProductId: "" })]);
    const out = stampSentAsOf(before, linesOf(then), linesOf(then), THEN);
    const strip = (p: any) => ({ ...p, products: p.products.map((l: any) => ({ ...l, linkedPfiRefs: l.linkedPfiRefs.map(({ sent, ...r }: any) => r) })) });
    expect(strip(out)).toEqual(strip(before));
  });
});

describe("isSent", () => {
  const row = { orderStatus: "not_ordered" };
  it("follows the PO's Sent button or the row's own status", () => {
    expect(isSent({ sentStatus: "sent" }, row, { orderStatus: "sending_order" })).toBe(true);
    expect(isSent({ sentStatus: "not_sent" }, row, { orderStatus: "ordered" })).toBe(true);
    expect(isSent({ sentStatus: "not_sent" }, row, { orderStatus: "received" })).toBe(true);
    expect(isSent({ sentStatus: "not_sent" }, row, { orderStatus: "floor_stock" })).toBe(true);
    expect(isSent({}, { orderStatus: "ordered" }, {})).toBe(true);
    for (const status of ["not_ordered", "sending_order", "removed", undefined]) expect(isSent({ sentStatus: "not_sent" }, row, { orderStatus: status })).toBe(false);
  });
});

describe("every field Sale can change on a line", () => {
  const FULL = { id: "L-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", caseBarcode: "4012824436718", caseSize: "6 x 17s", bbd: "02/2027", vat: "0.0% Z", quantity: 100, rate: 9.02 };
  const sentOf = (line: any = FULL) => refsOf(stampSent(po("sent", [ref()]), linesOf([line]), NOW))[0].sent;
  it("is remembered when the order goes out", () => {
    expect(sentOf()).toEqual({ lineId: "L-tea", index: 0, at: NOW, qty: 100, product: "Yogi Tea Classic Chai", ean: "4012824406711", caseBarcode: "4012824436718", caseSize: "6 x 17s", bbd: "02/2027", vat: "0.0% Z", rate: 9.02 });
  });
  it("is reported when it changes, one entry per field, quantity first", () => {
    const now = { ...FULL, product: "Yogi Tea Chai 17 bags", rate: 9.5, quantity: 120, bbd: "03/2027" };
    expect(changesOf(sentOf(), now)).toEqual([
      { field: "quantity", label: "quantity", from: 100, to: 120 },
      { field: "product", label: "name", from: "Yogi Tea Classic Chai", to: "Yogi Tea Chai 17 bags" },
      { field: "bbd", label: "BBD", from: "02/2027", to: "03/2027" },
      { field: "rate", label: "rate", from: 9.02, to: 9.5 },
    ]);
    expect(describeChanges(changesOf(sentOf(), now))).toBe("quantity 100 → 120; name Yogi Tea Classic Chai → Yogi Tea Chai 17 bags; BBD 02/2027 → 03/2027; rate 9.02 → 9.5");
    expect(describeWas(changesOf(sentOf(), now))).toBe("quantity was 100; name was Yogi Tea Classic Chai; BBD was 02/2027; rate was 9.02");
    expect(describeWas(changesOf(sentOf({ ...FULL, bbd: "" }), { ...FULL, bbd: "03/2027" }))).toBe("BBD was empty");
    expect(describeChanges(changesOf(sentOf(), { ...FULL, bbd: "" }))).toBe("BBD 02/2027 → (empty)");
    for (const [field, value, label] of [["ean", "5000168014920", "EAN"], ["caseBarcode", "05000168014913", "case barcode"], ["caseSize", "10 x 400g", "pack"], ["vat", "20.0% S", "VAT"]] as const) {
      expect(changesOf(sentOf(), { ...FULL, [field]: value }).map((c) => c.label)).toEqual([label]);
    }
  });
  it("flags a change of rate or name alone, without a change of quantity", () => {
    const r = { ...ref(), sent: sentOf() };
    const c = changeSinceSent(r, [{ ...FULL, rate: 10 }]);
    expect(c).toEqual({ kind: "changed", product: "Yogi Tea Classic Chai", changes: [{ field: "rate", label: "rate", from: 9.02, to: 10 }] });
    expect(c).not.toHaveProperty("from");
    expect(changeSinceSent(r, [{ ...FULL, product: "Yogi Tea Chai" }])).toMatchObject({ kind: "changed", product: "Yogi Tea Chai" });
  });
  it("does not take the way a value is typed for a change", () => {
    const r = { ...ref(), sent: sentOf() };
    expect(changeSinceSent(r, [{ ...FULL, quantity: "100", rate: "9.02", product: "  Yogi Tea  Classic Chai ", vat: "0", ean: " 4012824406711 " }])).toBe(null);
    expect(changeSinceSent({ ...ref(), sent: sentOf({ ...FULL, product: "Nutella Biscuits Tube T12 \n168g" }) }, [{ ...FULL, product: "Nutella Biscuits Tube T12 168g" }])).toBe(null); // a line break inside a name
  });
  it("shows on the PFI side, each field once, with the rows Seen has to settle", () => {
    const line = { ...FULL, quantity: 120, rate: 9.5, receipts: [
      { poId: "po-1", poNo: "2480", poLineId: "r1", pfiId: "pfi-1", orderStatus: "ordered", quantity: 100, sent: sentOf() },
      { poId: "po-2", poNo: "2490", poLineId: "r2", pfiId: "pfi-1", orderStatus: "ordered", quantity: 20, sent: sentOf({ ...FULL, quantity: 120 }) }, // already knows the quantity, not the rate
    ] };
    const c = lineChange(line)!;
    expect(c.changes).toEqual([{ field: "quantity", label: "quantity", from: 100, to: 120 }, { field: "rate", label: "rate", from: 9.02, to: 9.5 }]);
    expect(c.pos).toEqual(["2480", "2490"]);
  });
  it("is the new reference once the buyer has seen the change", () => {
    const now = [{ ...FULL, quantity: 120, rate: 9.5 }];
    const next = acknowledged(sentOf(), now, "2026-09-30T10:00:00.000Z");
    expect(next).toMatchObject({ qty: 120, rate: 9.5, at: "2026-09-30T10:00:00.000Z" });
    expect(changeSinceSent({ ...ref(), sent: next }, now)).toBe(null);
  });
});

describe("a reference taken when only the quantity and the name were remembered", () => {
  const FULL = { id: "L-tea", product: "Yogi Tea Classic Chai", ean: "4012824406711", caseBarcode: "", caseSize: "6 x 17s", bbd: "02/2027", vat: "0.0% Z", quantity: 100, rate: 9.02 };
  const old = { lineId: "L-tea", qty: 100, product: "Yogi Tea Classic Chai", index: 0, at: NOW };
  it("compares what it holds and nothing else", () => {
    expect(changesOf(old, { ...FULL, rate: 12, bbd: "09/2027" })).toEqual([]);
    expect(changesOf(old, { ...FULL, quantity: 90 }).map((c) => c.field)).toEqual(["quantity"]);
  });
  it("is completed the next time the PO is saved, keeping the quantity and the name it had", () => {
    const out = stampSent(po("sent", [ref({ sent: old })]), linesOf([{ ...FULL, quantity: 130, rate: 9.5 }]), "2026-09-30T10:00:00.000Z");
    expect(refsOf(out)[0].sent).toEqual({ ...old, ean: "4012824406711", caseBarcode: "", caseSize: "6 x 17s", bbd: "02/2027", vat: "0.0% Z", rate: 9.5 });
    expect(changeSinceSent(refsOf(out)[0], [{ ...FULL, quantity: 130, rate: 9.5 }])).toMatchObject({ changes: [{ field: "quantity", from: 100, to: 130 }] }); // the change it had already caught stays
    expect(stampSent(out, linesOf([{ ...FULL, quantity: 130, rate: 9.5 }]), "2026-10-01T10:00:00.000Z")).toBe(out);
  });
  it("is completed from the earlier copy of the data by the one-off run", () => {
    const THEN = "2026-09-28T16:45:00.000Z";
    const then = [{ ...FULL, rate: 9.02 }];
    const now = [{ ...FULL, rate: 9.5 }];
    const out = stampSentAsOf(po("sent", [ref({ sent: old })]), linesOf(now), linesOf(then), THEN);
    expect(refsOf(out)[0].sent).toMatchObject({ qty: 100, at: NOW, rate: 9.02, bbd: "02/2027" });
    expect(changeSinceSent(refsOf(out)[0], now)).toMatchObject({ changes: [{ field: "rate", from: 9.02, to: 9.5 }] });
    expect(stampSentAsOf(out, linesOf(now), linesOf(then), THEN)).toBe(out);
  });
});
