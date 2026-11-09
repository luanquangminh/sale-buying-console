import { describe, expect, it } from "vitest";
import { PAY_COMPANIES, confirmationOf, difference, diffTone, fmtDiff, forSale, isConfirmed, ledgerMonths, ledgerRows, monthOf, newestFirst, splitExpected, toConfirmCount, unmatched } from "../src/paymentsReceived.js";

const exp = (id: string, extra: Record<string, unknown> = {}) => ({ id, saleId: "sale-1", saleName: "Anna", date: "2026-10-20", company: "LTD", currency: "GBP", expectedAmount: 13560, sender: "Juara Trade", customer: "Juara Trade Fzco", proof: true, createdAt: "2026-10-20T09:00:00.000Z", ...extra });
const rec = (id: string, expectedId: string | "" = "", extra: Record<string, unknown> = {}) => ({ id, expectedId, receivedDate: "2026-10-21", company: "LTD", currency: "GBP", receivedAmount: 13510.36, sender: "JUARA TRADE - FZCO", qb: { date: "", time: "", done: false, addedBy: "" }, confirmedBy: "Finance", createdAt: "2026-10-21T10:00:00.000Z", ...extra });

describe("payments received: what confirms what", () => {
  it("offers the two companies of the Excel", () => { expect(PAY_COMPANIES).toEqual(["LTD", "LLC"]); });
  it("an expected payment is confirmed by the received one that points at it", () => {
    const e = exp("e1"); const r = rec("r1", "e1");
    expect(confirmationOf(e, [rec("r0"), r])).toBe(r);
    expect(isConfirmed(e, [r])).toBe(true);
    expect(isConfirmed(e, [rec("r2", "e9")])).toBe(false);
    expect(isConfirmed(e, [])).toBe(false);
  });
  it("the difference is what the bank got minus what the rep expected, to the cent", () => {
    expect(difference(exp("e1"), rec("r1", "e1"))).toBe(-49.64);
    expect(difference(exp("e1", { expectedAmount: "100" }), rec("r1", "e1", { receivedAmount: "100.00" }))).toBe(0);
    expect(difference(exp("e1", { expectedAmount: 100 }), rec("r1", "e1", { receivedAmount: 101.5 }))).toBe(1.5);
    expect(difference(exp("e1", { expectedAmount: "" }), rec("r1", "e1"))).toBe(null);
    expect(difference(exp("e1"), rec("r1", "e1", { receivedAmount: "" }))).toBe(null);
    expect(difference(exp("e1"), null)).toBe(null);
  });
  it("reads the gap with its sign, and colours a shortfall red", () => {
    expect(fmtDiff(-49.64)).toBe("−49.64");
    expect(fmtDiff(1234.5)).toBe("+1,234.50");
    expect(fmtDiff(0)).toBe("0.00");
    expect(fmtDiff(null)).toBe("");
    expect([diffTone(-1), diffTone(0), diffTone(2), diffTone(null)]).toEqual(["red", "grey", "green", "grey"]);
  });
});

describe("payments received: the lists each screen shows", () => {
  const expected = [exp("e1", { date: "2026-10-18" }), exp("e2", { date: "2026-10-20", saleId: "sale-2", saleName: "Bob" }), exp("e3", { date: "2026-10-19" })];
  const received = [rec("r1", "e1", { receivedDate: "2026-10-22" }), rec("r2", "", { receivedDate: "2026-10-23" }), rec("r3", "e2", { receivedDate: "2026-10-21" })];
  it("splits a rep's expected into pending and confirmed, newest first", () => {
    const { pending, confirmed } = splitExpected(forSale(expected, "sale-1"), received);
    expect(pending.map((e) => e.id)).toEqual(["e3"]);
    expect(confirmed.map((e) => [e.id, e.confirmation.id, e.diff])).toEqual([["e1", "r1", -49.64]]);
    expect(forSale(expected, "sale-2").map((e) => e.id)).toEqual(["e2"]);
    expect(forSale(expected, "sale-9")).toEqual([]);
  });
  it("for the accountant: everything pending to confirm, everything confirmed by receipt date, and the unannounced money apart", () => {
    const { pending, confirmed } = splitExpected(expected, received);
    expect(pending.map((e) => e.id)).toEqual(["e3"]);
    expect(confirmed.map((e) => e.id)).toEqual(["e1", "e2"]); // r1 on the 22nd before r3 on the 21st
    expect(unmatched(received).map((r) => r.id)).toEqual(["r2"]);
    expect(toConfirmCount(expected, received)).toBe(1);
  });
  it("a receipt whose expected payment is gone shows under Unmatched when the expected list is known", () => {
    const orphan = rec("r9", "e-gone", { receivedDate: "2026-10-24" });
    expect(unmatched([...received, orphan], expected).map((r) => r.id)).toEqual(["r9", "r2"]); // newest receipt first
    expect(unmatched([...received, orphan]).map((r) => r.id)).toEqual(["r2"]); // without the list, only the unannounced
  });
  it("orders by the date typed, then by when it was entered", () => {
    const list = [exp("a", { date: "2026-10-01", createdAt: "2026-10-01T08:00:00.000Z" }), exp("b", { date: "2026-10-02", createdAt: "2026-10-01T07:00:00.000Z" }), exp("c", { date: "2026-10-01", createdAt: "2026-10-01T09:00:00.000Z" })];
    expect(newestFirst(list, "date").map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
});

describe("payments received: the accountant's ledger, like the finance Excel", () => {
  const expected = [exp("e1", { date: "2026-10-30" }), exp("e2", { date: "2026-11-02", saleId: "sale-2", saleName: "Bob" }), exp("e3", { date: "2026-11-05", createdAt: "2026-11-05T09:00:00.000Z" }), exp("e4", { date: "2026-11-05", createdAt: "2026-11-05T08:00:00.000Z" })];
  const received = [rec("r1", "e1", { receivedDate: "2026-11-03" }), rec("r2", "", { receivedDate: "2026-11-01" }), rec("r9", "e-gone", { receivedDate: "2026-10-02" })];
  it("one row a payment: pending, confirmed, and the money nobody announced, oldest first", () => {
    const rows = ledgerRows(expected, received);
    expect(rows.map((r) => [r.kind, r.id, r.date])).toEqual([
      ["loose", "r9", "2026-10-02"], // a receipt whose announcement is gone counts as unannounced
      ["loose", "r2", "2026-11-01"],
      ["pending", "e2", "2026-11-02"],
      ["confirmed", "e1", "2026-11-03"], // announced in October, the bank's date puts it in November
      ["pending", "e4", "2026-11-05"], ["pending", "e3", "2026-11-05"], // same day: the one entered first comes first
    ]);
    const e1 = rows.find((r) => r.id === "e1")!;
    expect([e1.expected!.customer, e1.received!.id, e1.diff]).toEqual(["Juara Trade Fzco", "r1", -49.64]);
    expect(rows.find((r) => r.id === "r2")!.expected).toBe(null);
  });
  it("a row without a date is placed on the day it was entered", () => {
    expect(ledgerRows([exp("e5", { date: "", createdAt: "2026-09-09T10:00:00.000Z" })], []).map((r) => r.date)).toEqual(["2026-09-09"]);
    expect(ledgerRows([], [rec("r5", "", { receivedDate: "", createdAt: "2026-09-10T10:00:00.000Z" })]).map((r) => r.date)).toEqual(["2026-09-10"]);
  });
  it("the months, newest first, today's month always there, each with its count to confirm", () => {
    const rows = ledgerRows(expected, received);
    expect(ledgerMonths(rows, "2026-12-09")).toEqual([{ month: "2026-12", toConfirm: 0 }, { month: "2026-11", toConfirm: 3 }, { month: "2026-10", toConfirm: 0 }]);
    expect(ledgerMonths(rows, "2026-11-09")).toEqual([{ month: "2026-11", toConfirm: 3 }, { month: "2026-10", toConfirm: 0 }]);
    expect(ledgerMonths([], "2026-11-09")).toEqual([{ month: "2026-11", toConfirm: 0 }]);
    expect(monthOf("2026-11-09")).toBe("2026-11"); expect(monthOf("")).toBe("");
  });
});
