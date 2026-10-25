import { describe, expect, it } from "vitest";
import { floorStockOf, keepRemoved, lineComplete, lineReceivedTotal, lineRemoved, lineShort, lineStatusSource, pfiTrackingStatus, rollupStatusLabel } from "../src/status.js";

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

describe("floor stock on a PFI line (the buyer's box)", () => {
  it("reads the box as cases, blank or odd values as none", () => {
    expect(floorStockOf({ floorStock: 30 })).toBe(30);
    expect(floorStockOf({ floorStock: "30" })).toBe(30);
    expect(floorStockOf({ floorStock: "" })).toBe(0);
    expect(floorStockOf({ floorStock: "-4" })).toBe(0);
    expect(floorStockOf({ floorStock: "abc" })).toBe(0);
    expect(floorStockOf({})).toBe(0);
  });
  it("adds a floor stock status to the line's label once the box is filled", () => {
    expect(lineStatusSource({ receipts: [r("ordered")], floorStock: "" })).toEqual([r("ordered")]);
    expect(rollupStatusLabel(lineStatusSource({ receipts: [r("ordered")], floorStock: 30 }))).toBe("Partly received");
    expect(rollupStatusLabel(lineStatusSource({ receipts: [r("received", 50)], floorStock: 30 }))).toBe("Received");
    expect(rollupStatusLabel(lineStatusSource({ receipts: [], floorStock: 30 }))).toBe("Floor stock");
  });
  it("counts with what arrived: 80 needed, 30 on the floor, 50 received is complete", () => {
    const line = { quantity: 80, receivedQuantity: "", floorStock: 30, receipts: [r("received", 50)] };
    expect(lineReceivedTotal(line)).toBe(80);
    expect(lineShort(line)).toBe(0);
    expect(lineComplete(line)).toBe(true);
    const less = { ...line, receipts: [r("received", 40)] };
    expect(lineReceivedTotal(less)).toBe(70);
    expect(lineShort(less)).toBe(10);
    expect(lineComplete(less)).toBe(false);
  });
  it("on its own, judges the line only when it covers the whole of it", () => {
    expect(lineReceivedTotal({ quantity: 80, receivedQuantity: "", floorStock: 30, receipts: [r("ordered", "")] })).toBe(null); // the rest is still to come
    expect(lineShort({ quantity: 80, receivedQuantity: "", floorStock: 30, receipts: [r("ordered", "")] })).toBe(0);
    expect(lineReceivedTotal({ quantity: 80, receivedQuantity: "", floorStock: 30 })).toBe(null);
    expect(lineReceivedTotal({ quantity: 80, receivedQuantity: "", floorStock: 80 })).toBe(80);
    expect(lineComplete({ quantity: 80, receivedQuantity: "", floorStock: 80 })).toBe(true);
    expect(lineComplete({ quantity: 80, receivedQuantity: "", floorStock: 100 })).toBe(true);
  });
  it("works with a line no PO covers, through its own received box", () => {
    expect(lineReceivedTotal({ quantity: 80, receivedQuantity: 50, floorStock: 30 })).toBe(80);
    expect(lineShort({ quantity: 80, receivedQuantity: 20, floorStock: 30 })).toBe(30);
  });
  it("completes the PFI in Order Tracking the same way", () => {
    expect(pfiTrackingStatus({ products: [{ quantity: 80, receivedQuantity: "", floorStock: 30, receipts: [r("received", 50)] }], delivery: {} })).toBe("Complete Ordering");
    expect(pfiTrackingStatus({ products: [{ quantity: 80, receivedQuantity: "", floorStock: 30, receipts: [r("received", 40)] }], delivery: {} })).toBe("Pending");
  });
});

describe("lineShort: what a line still lacks once something arrived", () => {
  it("is the order's need against what arrived, not the PO's quantity", () => {
    // the order needs 80; the buyer bought 50 and all 50 came: the line is 30 short, whatever the PO says
    expect(lineShort({ quantity: 80, receivedQuantity: "", receipts: [{ orderStatus: "received", quantity: 50, receivedQuantity: 50 }] })).toBe(30);
    expect(lineShort({ quantity: 80, receivedQuantity: "", receipts: [{ orderStatus: "received", quantity: 80, receivedQuantity: 70 }] })).toBe(10);
    expect(lineShort({ quantity: 80, receivedQuantity: "", receipts: [{ orderStatus: "received", quantity: 50, receivedQuantity: 50 }, { orderStatus: "received", quantity: 30, receivedQuantity: 30 }] })).toBe(0);
  });
  it("is 0 while nothing has arrived, or when the line is complete or over", () => {
    expect(lineShort({ quantity: 80, receivedQuantity: "", receipts: [{ orderStatus: "ordered", quantity: 50, receivedQuantity: "" }] })).toBe(0);
    expect(lineShort({ quantity: 80, receivedQuantity: 90 })).toBe(0);
  });
});
