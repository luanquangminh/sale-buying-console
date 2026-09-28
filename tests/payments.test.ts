import { describe, expect, it } from "vitest";
import { dueLabel, dueState } from "../src/payments.js";

const TODAY = "2026-09-28";

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
  it("stops counting once paid, however late", () => {
    expect(dueState({ dueDate: "2026-01-01", paid: true }, TODAY)).toEqual({ state: "paid", days: 0 });
    expect(dueLabel({ dueDate: "2026-01-01", paid: true }, TODAY)).toBe("Paid");
  });
  it("has no state to show without a due date", () => {
    expect(dueLabel({ dueDate: "" }, TODAY)).toBe("No due date");
    expect(dueLabel({}, TODAY)).toBe("No due date");
    expect(dueLabel({ dueDate: "soon" }, TODAY)).toBe("No due date");
  });
});
