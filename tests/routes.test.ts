import { describe, expect, it } from "vitest";
import { SITE_MAP, homeFor, pathFor, sectionAllowed, stateFor } from "../src/routes.js";

const reps = [{ id: "sale-1" }, { id: "sale-2" }];

describe("pathFor: every screen has an address", () => {
  it("names the rep's own pages plainly, and an admin's by the rep", () => {
    expect(pathFor({ topSection: "customer", subSection: "customer" }, "sale")).toBe("/customers");
    expect(pathFor({ topSection: "customer", subSection: "orders" }, "sale")).toBe("/orders");
    expect(pathFor({ topSection: "customer", subSection: "payments" }, "sale")).toBe("/payments-received");
    expect(pathFor({ topSection: "customer", subSection: "orders", selectedSaleId: "sale-2" }, "admin")).toBe("/reps/sale-2/orders");
    expect(pathFor({ topSection: "customer", subSection: "customer", selectedSaleId: "" }, "admin")).toBe("/customers"); // no rep yet
  });
  it("names the buyer's pages and the single pages", () => {
    expect(pathFor({ topSection: "buyerspace", buyerSubTab: "fulfillment" }, "buyer")).toBe("/buyer/orders-to-update");
    expect(pathFor({ topSection: "buyerspace" }, "admin")).toBe("/buyer/inbox");
    expect(pathFor({ topSection: "paymentsReceived" }, "accountant")).toBe("/accounting/payments-received");
    expect(pathFor({ topSection: "payments" }, "admin")).toBe("/admin/customer-balance");
    expect(pathFor({ topSection: "warehouse" }, "warehouse")).toBe("/warehouse");
    expect(pathFor({ topSection: "agent" }, "sale")).toBe("/agent");
    expect(pathFor({ topSection: "nothing" }, "sale")).toBe("/");
  });
});

describe("stateFor: an address back to the screen, for the role", () => {
  it("round-trips every page of the site map for a role that may open it", () => {
    const cases: Array<[any, string]> = [
      [{ topSection: "customer", subSection: "payments" }, "sale"],
      [{ topSection: "customer", subSection: "orders", selectedSaleId: "sale-2" }, "admin"],
      [{ topSection: "buyerspace", buyerSubTab: "po" }, "buyer"],
      [{ topSection: "mai" }, "admin"], [{ topSection: "accounts" }, "admin"], [{ topSection: "payments" }, "admin"],
      [{ topSection: "paymentsReceived" }, "accountant"], [{ topSection: "delivery" }, "buyer"], [{ topSection: "warehouse" }, "warehouse"],
      [{ topSection: "booking" }, "buyer"], [{ topSection: "agent" }, "sale"],
    ];
    for (const [state, role] of cases) expect(stateFor(pathFor(state, role), role, { reps })).toEqual(state);
  });
  it("sends a role home from a page it may not open, or from an address that names nothing", () => {
    expect(stateFor("/buyer/inbox", "sale", { reps })).toBe(null);
    expect(stateFor("/admin/accounts", "buyer", { reps })).toBe(null);
    expect(stateFor("/customers", "accountant", { reps })).toBe(null);
    expect(stateFor("/orders", "warehouse", { reps })).toBe(null);
    expect(stateFor("/reps/sale-1/orders", "sale", { reps })).toBe(null); // another rep's page
    expect(stateFor("/reps/sale-9/orders", "admin", { reps })).toBe(null); // no such rep
    expect(stateFor("/nothing-here", "admin", { reps })).toBe(null);
    expect(stateFor("/", "buyer", { reps })).toBe(null);
    expect(stateFor("", "buyer", { reps })).toBe(null);
  });
  it("forgives a trailing slash and a query string, and keeps the old /#agent link working", () => {
    expect(stateFor("/buyer/jobs/", "buyer", { reps })).toEqual({ topSection: "buyerspace", buyerSubTab: "jobs" });
    expect(stateFor("/orders?x=1", "sale", { reps })).toEqual({ topSection: "customer", subSection: "orders" });
    expect(stateFor("/", "sale", { hash: "#agent", reps })).toEqual({ topSection: "agent" });
    expect(stateFor("/", "warehouse", { hash: "#agent", reps })).toBe(null);
    expect(stateFor("/customers", "admin", { reps })).toEqual({ topSection: "customer", subSection: "customer" }); // the admin keeps the rep they had
  });
  it("knows where each role starts", () => {
    expect(["admin", "sale", "buyer", "warehouse", "accountant"].map(homeFor)).toEqual(["customer", "customer", "buyerspace", "warehouse", "paymentsReceived"]);
    expect(sectionAllowed("accounts", "admin")).toBe(true);
    expect(sectionAllowed("accounts", "sale")).toBe(false);
  });
  it("lists every address once in the site map, and each one parses for a role named on it", () => {
    expect(new Set(SITE_MAP.map(([p]) => p)).size).toBe(SITE_MAP.length);
    for (const [path, who] of SITE_MAP) {
      const role = who.split(",")[0].trim().replace("everyone but the accountant", "sale");
      expect(stateFor(path.replace("<rep id>", "sale-1"), role, { reps })).not.toBe(null);
    }
  });
});
