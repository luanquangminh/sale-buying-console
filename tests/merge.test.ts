import { describe, expect, it } from "vitest";
import { mergeOtherRole } from "../src/merge.js";

const line = (id: string, extra: Record<string, unknown> = {}) => ({ id, product: `P${id}`, quantity: 10, rate: 1, orderStatus: "not_ordered", receivedQuantity: "", ...extra });
const draft = { id: "F", products: [line("a", { product: "Pa (sale edit)" }), line("b")], documents: [{ id: "d1", type: "COO", status: "not_applied" }], payments: [], delivery: { type: "delivery" } };
const fresh = { id: "F", products: [line("a", { orderStatus: "ordered", receivedQuantity: 4 }), line("b"), line("c")], documents: [{ id: "d1", type: "COO", status: "applied" }, { id: "d2", type: "HC", status: "not_applied" }], payments: [{ id: "p1", amount: 5 }], delivery: { type: "collection" } };

describe("mergeOtherRole", () => {
  it("for a sale draft, keeps the sale's lines and takes the buyer's tracking fields and document statuses", () => {
    const m = mergeOtherRole(draft, fresh, "sale");
    expect(m.products.map((p: any) => p.id)).toEqual(["a", "b"]);
    expect(m.products[0]).toMatchObject({ product: "Pa (sale edit)", orderStatus: "ordered", receivedQuantity: 4 });
    expect(m.documents).toEqual([{ id: "d1", type: "COO", status: "applied" }]);
    expect(m.delivery).toEqual({ type: "delivery" }); // shared field: draft wins
  });
  it("for a buyer draft, takes the sale's lines, documents and payments but keeps the buyer's own edits", () => {
    const bdraft = { ...draft, products: [line("a", { orderStatus: "received", receivedQuantity: 10 }), line("b")], documents: [{ id: "d1", type: "COO", status: "waiting_delivery" }] };
    const m = mergeOtherRole(bdraft, fresh, "buyer");
    expect(m.products.map((p: any) => p.id)).toEqual(["a", "b", "c"]);
    expect(m.products[0]).toMatchObject({ product: "Pa", orderStatus: "received", receivedQuantity: 10 });
    expect(m.documents.map((d: any) => [d.id, d.status])).toEqual([["d1", "waiting_delivery"], ["d2", "not_applied"]]);
    expect(m.payments).toEqual([{ id: "p1", amount: 5 }]);
  });
  it("is a no-op without a fresh record", () => {
    expect(mergeOtherRole(draft, null, "sale")).toBe(draft);
  });
});
