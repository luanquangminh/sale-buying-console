import { describe, expect, it } from "vitest";
import { groupBySale, hasSaleChange } from "../src/orderGroups.js";

const line = (quantity: number, receivedQuantity: number | string = "", extra: Record<string, unknown> = {}) => ({ id: `l-${Math.random()}`, product: "Tea", quantity, receivedQuantity, ...extra });
const pfi = (pfiNo: string, saleName: string, products: any[], extra: Record<string, unknown> = {}) => ({ id: `pfi-${pfiNo}`, pfiNo, saleName, customerName: `Customer ${pfiNo}`, products, delivery: {}, ...extra });
const pending = (no: string, sale: string) => pfi(no, sale, [line(10)]);
const complete = (no: string, sale: string) => pfi(no, sale, [line(10, 10)]);
const loaded = (no: string, sale: string) => pfi(no, sale, [line(10, 10)], { delivery: { loaded: "loaded" } });

describe("groupBySale", () => {
  const data = {
    "sale-w": [pending("3418", "Waleed"), loaded("3399", "Waleed"), pending("3364", "Waleed")],
    "sale-l": [complete("3416", "lyly"), pending("3407", "lyly")],
    "sale-z": [pending("3405", "Lizzie")],
    "sale-empty": [],
  };
  it("lists the reps that have PFIs, A to Z", () => {
    expect(groupBySale(data).map((g) => g.saleName)).toEqual(["Lizzie", "lyly", "Waleed"]);
  });
  it("puts a rep's pending PFIs first, then complete ordering, then loaded, keeping the list's own order inside each", () => {
    const waleed = groupBySale(data).find((g) => g.saleName === "Waleed")!;
    expect(waleed.pfis.map((p) => p.pfiNo)).toEqual(["3418", "3364", "3399"]);
    expect(groupBySale(data).find((g) => g.saleName === "lyly")!.pfis.map((p) => p.pfiNo)).toEqual(["3407", "3416"]);
  });
  it("counts each status per rep", () => {
    const byName = Object.fromEntries(groupBySale(data).map((g) => [g.saleName, g.counts]));
    expect(byName.Waleed).toEqual({ Pending: 2, "Complete Ordering": 0, Loaded: 1 });
    expect(byName.lyly).toEqual({ Pending: 1, "Complete Ordering": 1, Loaded: 0 });
  });
  it("takes the rep's name from the accounts when given, from the PFI otherwise", () => {
    expect(groupBySale({ "sale-z": [pending("1", "Old Name")] }, (id) => (id === "sale-z" ? "Lizzie Tran" : ""))[0].saleName).toBe("Lizzie Tran");
    expect(groupBySale({ "sale-z": [pending("1", "")] })[0].saleName).toBe("Sale");
  });
  it("copes with nothing to list", () => {
    expect(groupBySale({})).toEqual([]);
    expect(groupBySale(undefined)).toEqual([]);
  });
});

describe("hasSaleChange", () => {
  const sent = { lineId: "L1", qty: 10, product: "Tea", index: 0, at: "2026-09-28T10:00:00.000Z" };
  const receipt = { poId: "po-1", poNo: "2480", poLineId: "r1", pfiId: "pfi-1", orderStatus: "ordered", quantity: 10, sent };
  it("is true for a quantity changed, or a line removed, after a PO was sent", () => {
    expect(hasSaleChange({ products: [{ id: "L1", product: "Tea", quantity: 12, receipts: [receipt] }] })).toBe(true);
    expect(hasSaleChange({ products: [], unmatchedReceipts: [receipt] })).toBe(true);
  });
  it("is false otherwise", () => {
    expect(hasSaleChange({ products: [{ id: "L1", product: "Tea", quantity: 10, receipts: [receipt] }] })).toBe(false);
    expect(hasSaleChange({ products: [{ id: "L1", product: "Tea", quantity: 12, receipts: [{ ...receipt, sent: null }] }] })).toBe(false);
    expect(hasSaleChange({ products: [] })).toBe(false);
  });
  it("adds up per rep", () => {
    const groups = groupBySale({ s: [
      { id: "a", pfiNo: "1", saleName: "Rep", delivery: {}, products: [{ id: "L1", product: "Tea", quantity: 12, receipts: [receipt] }] },
      { id: "b", pfiNo: "2", saleName: "Rep", delivery: {}, products: [{ id: "L1", product: "Tea", quantity: 10, receipts: [receipt] }] },
    ] });
    expect(groups[0].changed).toBe(1);
  });
});
