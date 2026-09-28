import { describe, expect, it } from "vitest";
import { dueLabel, dueState, groupByCustomer, isOutstanding, PAY_STATUSES, payStatus } from "../src/payments.js";

const TODAY = "2026-09-28";

describe("payStatus", () => {
  it("offers Have not paid, Received proof and Received, in that order", () => {
    expect(PAY_STATUSES.map((s) => s.label)).toEqual(["Have not paid", "Received proof", "Received"]);
  });
  it("starts as Have not paid", () => {
    expect(payStatus({})).toBe("not_paid");
    expect(payStatus({ status: "" })).toBe("not_paid");
    expect(payStatus({ status: "something else" })).toBe("not_paid");
  });
  it("reads the Paid tick of records saved before the status existed", () => {
    expect(payStatus({ paid: true })).toBe("received");
    expect(payStatus({ paid: false })).toBe("not_paid");
  });
  it("lets the status win over an older tick", () => {
    expect(payStatus({ paid: true, status: "proof" })).toBe("proof");
    expect(payStatus({ paid: false, status: "received" })).toBe("received");
  });
  it("keeps an invoice outstanding until the money is received", () => {
    expect(isOutstanding({ status: "not_paid" })).toBe(true);
    expect(isOutstanding({ status: "proof" })).toBe(true);
    expect(isOutstanding({ status: "received" })).toBe(false);
  });
});

describe("dueState / dueLabel", () => {
  it("is overdue from the day after the due date, counting the days late", () => {
    expect(dueState({ dueDate: "2026-09-27" }, TODAY)).toEqual({ state: "overdue", days: 1 });
    expect(dueLabel({ dueDate: "2026-09-27" }, TODAY)).toBe("Overdue 1 day");
    expect(dueLabel({ dueDate: "2026-08-28" }, TODAY)).toBe("Overdue 31 days");
    expect(dueLabel({ dueDate: "2025-12-31" }, TODAY)).toBe("Overdue 271 days"); // across the year end
  });
  it("is not overdue on the due date itself", () => {
    expect(dueState({ dueDate: TODAY }, TODAY)).toEqual({ state: "due", days: 0 });
    expect(dueLabel({ dueDate: TODAY }, TODAY)).toBe("Due today");
    expect(dueLabel({ dueDate: "2026-09-29" }, TODAY)).toBe("Due in 1 day");
    expect(dueLabel({ dueDate: "2026-10-28" }, TODAY)).toBe("Due in 30 days");
  });
  it("stops counting once the money is received, however late", () => {
    expect(dueState({ dueDate: "2026-01-01", status: "received" }, TODAY)).toEqual({ state: "paid", days: 0 });
    expect(dueLabel({ dueDate: "2026-01-01", status: "received" }, TODAY)).toBe("Settled");
    expect(dueLabel({ dueDate: "2026-01-01", paid: true }, TODAY)).toBe("Settled"); // an older record
  });
  it("keeps counting while only a proof of payment has come in", () => {
    expect(dueLabel({ dueDate: "2026-09-20", status: "proof" }, TODAY)).toBe("Overdue 8 days");
  });
  it("has no state to show without a due date", () => {
    expect(dueLabel({ dueDate: "" }, TODAY)).toBe("No due date");
    expect(dueLabel({}, TODAY)).toBe("No due date");
    expect(dueLabel({ dueDate: "soon" }, TODAY)).toBe("No due date");
  });
});

describe("groupByCustomer", () => {
  const inv = (customer: string, invNo: string, amount: number | string, extra: Record<string, unknown> = {}) => ({ id: invNo, customer, inv: invNo, amount, currency: "GBP", dueDate: "2026-10-30", ...extra });
  it("gives each customer one entry with its invoices, A to Z", () => {
    const groups = groupByCustomer([inv("Tema Wholesale", "INV-3", 300), inv("Acme Foods Ltd", "INV-1", 100), inv("Tema Wholesale", "INV-4", 50), inv("lagos foods", "INV-2", 200)], TODAY);
    expect(groups.map((g) => g.customer)).toEqual(["Acme Foods Ltd", "lagos foods", "Tema Wholesale"]);
    expect(groups[2].invoices.map((i) => i.inv)).toEqual(["INV-3", "INV-4"]);
  });
  it("adds up what is outstanding: everything but the invoices received", () => {
    const [g] = groupByCustomer([
      inv("Acme", "A", 1000),
      inv("Acme", "B", 250.5, { status: "proof" }),
      inv("Acme", "C", 400, { status: "received" }),
      inv("Acme", "D", 99.99, { paid: true }), // an older record, ticked Paid
    ], TODAY);
    expect(g.outstanding).toEqual({ GBP: 1250.5 });
    expect(g.invoiced).toEqual({ GBP: 1750.49 });
    expect(g.open).toBe(2);
  });
  it("keeps currencies apart", () => {
    const [g] = groupByCustomer([inv("Acme", "A", 1000), inv("Acme", "B", 500, { currency: "USD" }), inv("Acme", "C", 20, { currency: "USD" })], TODAY);
    expect(g.outstanding).toEqual({ GBP: 1000, USD: 520 });
  });
  it("has nothing outstanding once every invoice is received", () => {
    const [g] = groupByCustomer([inv("Acme", "A", 1000, { status: "received" })], TODAY);
    expect(g.outstanding).toEqual({});
    expect(g.open).toBe(0);
    expect(g.invoiced).toEqual({ GBP: 1000 });
  });
  it("counts overdue invoices and containers on hold among what is outstanding", () => {
    const [g] = groupByCustomer([
      inv("Acme", "A", 1, { dueDate: "2026-09-01", onHold: true }),
      inv("Acme", "B", 1, { dueDate: "2026-09-10", status: "proof" }),
      inv("Acme", "C", 1, { dueDate: "2026-09-01", status: "received", onHold: true }), // settled: neither late nor held any more
      inv("Acme", "D", 1, { dueDate: "2026-12-01", onHold: true }),
    ], TODAY);
    expect(g.overdue).toBe(2);
    expect(g.onHold).toBe(2);
  });
  it("treats a name typed with other capitals or spaces as the same customer", () => {
    const groups = groupByCustomer([inv("Acme Foods Ltd", "A", 1), inv("  acme  foods ltd ", "B", 2), inv("ACME FOODS LTD", "C", 3)], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].customer).toBe("Acme Foods Ltd");
    expect(groups[0].outstanding).toEqual({ GBP: 6 });
  });
  it("stays free of float noise and copes with amounts that are not numbers", () => {
    const [g] = groupByCustomer([inv("Acme", "A", 0.1), inv("Acme", "B", 0.2), inv("Acme", "C", ""), inv("Acme", "D", "12.50")], TODAY);
    expect(g.outstanding).toEqual({ GBP: 12.8 });
  });
  it("copes with nothing to list", () => {
    expect(groupByCustomer([], TODAY)).toEqual([]);
    expect(groupByCustomer(undefined, TODAY)).toEqual([]);
  });
});
