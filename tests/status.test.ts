import { describe, expect, it } from "vitest";
import { keepRemoved, lineComplete, lineReceivedTotal, lineRemoved, pfiTrackingStatus, rollupStatusLabel } from "../src/status.js";

const r = (orderStatus: string, receivedQuantity: string | number = "") => ({ orderStatus, receivedQuantity });

describe("rollupStatusLabel", () => {
  it("keeps the original ladder", () => {
    expect(rollupStatusLabel([r("not_ordered")])).toBe("Not ordered");
    expect(rollupStatusLabel([r("sending_order"), r("not_ordered")])).toBe("Ordering");
    expect(rollupStatusLabel([r("ordered"), r("ordered")])).toBe("Ordered");
    expect(rollupStatusLabel([r("received"), r("ordered")])).toBe("Partly received");
    expect(rollupStatusLabel([r("received"), r("received")])).toBe("Received");
  });
  it("treats floor stock as fulfilled", () => {
    expect(rollupStatusLabel([r("floor_stock")])).toBe("Floor stock");
    expect(rollupStatusLabel([r("floor_stock"), r("received")])).toBe("Received");
    expect(rollupStatusLabel([r("floor_stock"), r("ordered")])).toBe("Partly received");
  });
  it("leaves removed rows out of the ladder", () => {
    expect(rollupStatusLabel([r("removed")])).toBe("Removed");
    expect(rollupStatusLabel([r("removed"), r("removed")])).toBe("Removed");
    expect(rollupStatusLabel([r("removed"), r("received")])).toBe("Received");
    expect(rollupStatusLabel([r("removed"), r("ordered")])).toBe("Ordered");
    expect(rollupStatusLabel([r("removed"), r("not_ordered")])).toBe("Not ordered");
    expect(rollupStatusLabel([r("removed"), r("received"), r("ordered")])).toBe("Partly received");
  });
});

describe("removed lines", () => {
  it("a line is removed when its own status is, or when every PO row covering it is", () => {
    expect(lineRemoved({ quantity: 5, orderStatus: "removed" })).toBe(true);
    expect(lineRemoved({ quantity: 5, orderStatus: "ordered" })).toBe(false);
    expect(lineRemoved({ quantity: 5, orderStatus: "ordered", receipts: [r("removed")] })).toBe(true);
    expect(lineRemoved({ quantity: 5, orderStatus: "removed", receipts: [r("removed"), r("ordered")] })).toBe(false);
  });
  it("cases on a removed PO row do not count as received", () => {
    expect(lineReceivedTotal({ quantity: 20, receipts: [r("removed", 8), r("received", 12)] })).toBe(12);
    expect(lineReceivedTotal({ quantity: 20, receipts: [r("removed", 8)] })).toBe(null);
    expect(lineComplete({ quantity: 20, receipts: [r("removed", 20)] })).toBe(false);
  });
  it("a PO-wide status change leaves removed rows alone", () => {
    expect(keepRemoved("removed", "received")).toBe("removed");
    expect(keepRemoved("ordered", "received")).toBe("received");
    expect(keepRemoved(undefined, "ordered")).toBe("ordered");
  });
});

describe("lineComplete", () => {
  it("uses the line's own received quantity when no PO covers it", () => {
    expect(lineComplete({ quantity: 20, receivedQuantity: 20 })).toBe(true);
    expect(lineComplete({ quantity: 20, receivedQuantity: 18 })).toBe(false);
    expect(lineComplete({ quantity: 20, receivedQuantity: "" })).toBe(false);
    expect(lineComplete({ quantity: "", receivedQuantity: 5 })).toBe(false);
  });
  it("floor stock completes a line once its quantity is entered, not before", () => {
    expect(lineComplete({ quantity: 20, receivedQuantity: "", receipts: [r("floor_stock", 20)] })).toBe(true);
    expect(lineComplete({ quantity: 20, receivedQuantity: "", receipts: [r("floor_stock", "")] })).toBe(false);
  });
  it("sums the PO rows and accepts a surplus", () => {
    expect(lineComplete({ quantity: 20, receivedQuantity: "", receipts: [r("received", 12), r("received", 8)] })).toBe(true);
    expect(lineComplete({ quantity: 20, receivedQuantity: "", receipts: [r("received", 22)] })).toBe(true);
    expect(lineComplete({ quantity: 20, receivedQuantity: "", receipts: [r("received", 12), r("ordered", "")] })).toBe(false);
  });
});

describe("pfiTrackingStatus", () => {
  const line = (q: number, got: number | string) => ({ quantity: q, receivedQuantity: got });
  it("is Pending with no lines or an incomplete line", () => {
    expect(pfiTrackingStatus({ products: [], delivery: {} })).toBe("Pending");
    expect(pfiTrackingStatus({ products: [line(10, 10), line(5, 2)], delivery: {} })).toBe("Pending");
  });
  it("is Complete Ordering when every line is complete", () => {
    expect(pfiTrackingStatus({ products: [line(10, 10), line(5, 6)], delivery: { loaded: "not_loaded" } })).toBe("Complete Ordering");
  });
  it("is Loaded as soon as the delivery is marked loaded, whatever the lines say", () => {
    expect(pfiTrackingStatus({ products: [line(10, 0)], delivery: { loaded: "loaded" } })).toBe("Loaded");
  });
  it("ignores removed lines when deciding Complete Ordering", () => {
    const removed = { quantity: 8, receivedQuantity: "", orderStatus: "removed" };
    expect(pfiTrackingStatus({ products: [line(10, 10), removed], delivery: {} })).toBe("Complete Ordering");
    expect(pfiTrackingStatus({ products: [line(10, 4), removed], delivery: {} })).toBe("Pending");
    expect(pfiTrackingStatus({ products: [removed], delivery: {} })).toBe("Pending");
    const viaPo = { quantity: 8, receivedQuantity: "", receipts: [r("removed")] };
    expect(pfiTrackingStatus({ products: [line(10, 10), viaPo], delivery: {} })).toBe("Complete Ordering");
  });
  it("reads old records without the loaded field as not loaded", () => {
    expect(pfiTrackingStatus({ products: [line(10, 10)], delivery: { type: "delivery" } })).toBe("Complete Ordering");
  });
});
