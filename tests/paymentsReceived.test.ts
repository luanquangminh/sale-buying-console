import { describe, expect, it } from "vitest";
import { LEDGER_COLUMNS, LEDGER_GROUPS, PAY_COMPANIES, QB_ADDERS, confirmationOf, difference, diffTone, enteredBy, fmtDiff, forSale, inFilter, inSpan, isConfirmed, ledgerMonths, ledgerRows, ledgerSheet, monthOf, monthRange, newestFirst, qbText, splitExpected, toConfirmCount, unmatched, unmatchedRows } from "../src/paymentsReceived.js";

const exp = (id: string, extra: Record<string, unknown> = {}) => ({ id, saleId: "sale-1", saleName: "Anna", date: "2026-10-20", company: "LTD", currency: "GBP", expectedAmount: 13560, sender: "Juara Trade", customer: "Juara Trade Fzco", proof: true, createdAt: "2026-10-20T09:00:00.000Z", ...extra });
const rec = (id: string, expectedId: string | "" = "", extra: Record<string, unknown> = {}) => ({ id, expectedId, receivedDate: "2026-10-21", company: "LTD", currency: "GBP", receivedAmount: 13510.36, sender: "JUARA TRADE - FZCO", qb: { date: "", time: "", addedBy: "" }, confirmedBy: "Finance", createdAt: "2026-10-21T10:00:00.000Z", ...extra });

describe("payments received: what confirms what", () => {
  it("offers the two companies of the Excel, and the two names that enter QuickBooks", () => { expect(PAY_COMPANIES).toEqual(["LTD", "LLC"]); expect(QB_ADDERS).toEqual(["Mai", "Karan"]); });
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
  it("the QuickBooks note reads date, time and the name, whichever are there", () => {
    expect(qbText({ date: "2026-10-22", time: "09:30", addedBy: "Mai" })).toBe("22/10/2026 09:30 · Mai");
    expect(qbText({ date: "2026-10-22", time: "", addedBy: "" })).toBe("22/10/2026");
    expect(qbText({ date: "", time: "", addedBy: "Karan" })).toBe("Karan");
    expect(qbText({ date: "", time: "", addedBy: "" })).toBe("");
    expect(qbText(null)).toBe("");
  });
});

describe("payments received: the lists each screen shows", () => {
  const expected = [exp("e1", { date: "2026-10-18" }), exp("e2", { date: "2026-10-20", saleId: "sale-2", saleName: "Bob" }), exp("e3", { date: "2026-10-19" })];
  const received = [rec("r1", "e1", { receivedDate: "2026-10-22" }), rec("r2", "", { receivedDate: "2026-10-23" }), rec("r3", "e2", { receivedDate: "2026-10-21" })];
  it("splits a rep's expected into pending and confirmed, newest first", () => {
    const { pending, confirmed, claimed } = splitExpected(forSale(expected, "sale-1"), received);
    expect(pending.map((e) => e.id)).toEqual(["e3"]);
    expect(confirmed.map((e) => [e.id, e.confirmation.id, e.diff])).toEqual([["e1", "r1", -49.64]]);
    expect(claimed).toEqual([]);
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

describe("payments received: money nobody announced, claimed by a rep", () => {
  const loose = rec("r5", "", { receivedDate: "2026-11-03", receivedAmount: 592, sender: "AKOTO V B", customer: "" });
  const other = rec("r6", "", { receivedDate: "2026-11-04", receivedAmount: 100 });
  const claim = exp("e5", { date: "2026-11-05", receivedId: "r5", expectedAmount: 600, customer: "Akoto Sprout", createdAt: "2026-11-05T09:00:00.000Z" });
  it("a claim takes the receipt out of the unclaimed money and waits for the accountant, with the gap against the bank's figure", () => {
    const { pending, confirmed, claimed } = splitExpected([claim], [loose, other]);
    expect(pending).toEqual([]); expect(confirmed).toEqual([]);
    expect(claimed.map((e) => [e.id, e.receipt.id, e.diff])).toEqual([["e5", "r5", -8]]);
    expect(unmatchedRows([loose, other], [claim]).map((x) => [x.receipt.id, x.claim && x.claim.id])).toEqual([["r6", null], ["r5", "e5"]]); // newest first, the claim on its receipt
    expect(unmatched([loose, other], [claim]).map((r) => r.id)).toEqual(["r6"]);
    expect(toConfirmCount([claim], [loose])).toBe(1); // the badge counts it
  });
  it("confirmed by the accountant (the receipt points at the claim) it is a confirmed payment like any other", () => {
    const linked = { ...loose, expectedId: "e5" };
    const { pending, confirmed, claimed } = splitExpected([claim], [linked, other]);
    expect(pending).toEqual([]); expect(claimed).toEqual([]);
    expect(confirmed.map((e) => [e.id, e.confirmation.id, e.diff])).toEqual([["e5", "r5", -8]]);
    expect(unmatchedRows([linked, other], [claim]).map((x) => x.receipt.id)).toEqual(["r6"]);
  });
  it("a claim whose receipt is gone, confirmed elsewhere, or claimed by another rep too counts as pending: the announcement stands", () => {
    expect(splitExpected([claim], [other]).pending.map((e) => e.id)).toEqual(["e5"]);
    expect(splitExpected([claim, exp("e9", { date: "2026-11-01" })], [{ ...loose, expectedId: "e9" }]).pending.map((e) => e.id)).toEqual(["e5"]);
    const rival = exp("e7", { saleId: "sale-2", saleName: "Bob", receivedId: "r5", date: "2026-11-06" });
    const split = splitExpected([claim, rival], [loose]);
    expect(split.claimed.map((e) => e.id)).toEqual(["e7"]); // the later in the list holds the claim
    expect(split.pending.map((e) => e.id)).toEqual(["e5"]);
    expect(unmatchedRows([loose], [claim, rival])[0].claim!.id).toBe("e7");
  });
  it("the ledger shows the claimed receipt as one row of its own kind, dated by the bank, under To confirm and Unmatched both", () => {
    const rows = ledgerRows([claim, exp("e1", { date: "2026-11-01" })], [loose, other]);
    expect(rows.map((r) => [r.kind, r.id, r.date])).toEqual([["pending", "e1", "2026-11-01"], ["claimed", "r5", "2026-11-03"], ["loose", "r6", "2026-11-04"]]);
    const claimedRow = rows[1];
    expect([claimedRow.expected!.id, claimedRow.received!.id, claimedRow.diff]).toEqual(["e5", "r5", -8]);
    expect(rows.filter((r) => inFilter(r.kind, "pending")).map((r) => r.id)).toEqual(["e1", "r5"]);
    expect(rows.filter((r) => inFilter(r.kind, "loose")).map((r) => r.id)).toEqual(["r5", "r6"]);
    expect(rows.filter((r) => inFilter(r.kind, "all")).length).toBe(3);
    expect(ledgerMonths(rows, "2026-11-09")).toEqual([{ month: "2026-11", toConfirm: 2 }]);
    expect(enteredBy(claimedRow)).toBe("Anna"); expect(enteredBy(rows[2])).toBe("Finance"); expect(enteredBy({ expected: { saleId: "s1", saleName: "" }, received: null } as any, (id: string) => (id === "s1" ? "Zed" : ""))).toBe("Zed");
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
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" }); expect(monthRange("2028-02").to).toBe("2028-02-29");
  });
  it("the export: the two header rows of the screen, the rows between the dates, amounts as numbers", () => {
    const rows = ledgerRows(expected, [rec("r1", "e1", { receivedDate: "2026-11-03", qb: { date: "2026-11-04", time: "14:05", addedBy: "Mai" } }), ...received.slice(1)]);
    const { aoa, merges, cols } = ledgerSheet(rows, "2026-11-01", "2026-11-03", (id: string) => (id === "sale-2" ? "Bob" : ""));
    expect(LEDGER_GROUPS.map((g) => g[1]).reduce((a, b) => a + b, 0)).toBe(LEDGER_COLUMNS.length);
    expect(aoa[0]).toEqual(["Details entered by Finance", "", "", "", "", "", "Details confirmed by Sales", "", "", "", "", "", "Difference"]);
    expect(merges).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 0, c: 6 }, e: { r: 0, c: 11 } }, { s: { r: 0, c: 12 }, e: { r: 0, c: 12 } }]);
    expect(aoa[1]).toEqual(LEDGER_COLUMNS);
    expect(aoa.slice(2)).toEqual([
      ["01/11/2026", "LTD", "GBP", 13510.36, "JUARA TRADE - FZCO", "", "", "", "", "", "", "Finance", ""], // r2: nobody announced it
      ["", "", "", "", "", "", "02/11/2026", "Juara Trade Fzco", "GBP", 13560, "Yes", "Bob", ""], // e2: nothing received yet
      ["03/11/2026", "LTD", "GBP", 13510.36, "JUARA TRADE - FZCO", "04/11/2026 14:05 · Mai", "30/10/2026", "Juara Trade Fzco", "GBP", 13560, "Yes", "Anna", -49.64], // e1 confirmed
    ]);
    expect(cols.length).toBe(LEDGER_COLUMNS.length);
    expect(ledgerSheet(rows, "", "").aoa.length).toBe(2 + rows.length); // no dates: everything
    expect(rows.filter((r) => inSpan(r, "2026-11-01", "2026-11-03")).length).toBe(3); expect(inSpan({ date: "2026-11-30" }, "2026-11-01", "")).toBe(true);
    expect(ledgerSheet(rows, "2026-12-01", "2026-12-31").aoa.length).toBe(2);
  });
});
