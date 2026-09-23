import { describe, expect, it } from "vitest";
import { addMonths, inMonth, monthGrid, monthLabel, startOfMonth } from "../src/calendar.js";

describe("calendar helpers", () => {
  it("builds a Monday-first 6-week grid around the month", () => {
    const g = monthGrid("2026-09-01"); // 1 Sep 2026 is a Tuesday
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-08-31");
    expect(g[1]).toBe("2026-09-01");
    expect(g[6]).toBe("2026-09-06"); // Sunday closes the week
    expect(g[41]).toBe("2026-10-11");
    expect(g.filter((d) => inMonth(d, "2026-09-01"))).toHaveLength(30);
  });
  it("starts on the 1st itself when the month opens on a Monday", () => {
    expect(monthGrid("2026-06-01")[0]).toBe("2026-06-01");
  });
  it("moves across year ends", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(startOfMonth("2026-09-23")).toBe("2026-09-01");
  });
  it("labels the month in English", () => {
    expect(monthLabel("2026-09-01")).toBe("September 2026");
  });
});
