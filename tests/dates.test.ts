import { describe, expect, it } from "vitest";
import { fmtDate, parseDmy } from "../src/dates.js";

describe("fmtDate", () => {
  it("formats ISO dates and datetimes as dd/mm/yyyy", () => {
    expect(fmtDate("2026-09-28")).toBe("28/09/2026");
    expect(fmtDate("2026-01-05T10:20:30.000Z")).toBe("05/01/2026");
  });
  it("leaves empty and non-ISO values alone", () => {
    expect(fmtDate("")).toBe("");
    expect(fmtDate(undefined)).toBe("");
    expect(fmtDate("02/2027")).toBe("02/2027");
  });
});

describe("parseDmy", () => {
  it("accepts dd/mm/yyyy with /, . or - and single digits", () => {
    expect(parseDmy("28/09/2026")).toBe("2026-09-28");
    expect(parseDmy("5.1.2026")).toBe("2026-01-05");
    expect(parseDmy(" 05-01-2026 ")).toBe("2026-01-05");
  });
  it("accepts bare ddmmyyyy (numeric keypads) and two-digit years", () => {
    expect(parseDmy("28092026")).toBe("2026-09-28");
    expect(parseDmy("28/09/26")).toBe("2026-09-28");
    expect(parseDmy("5.1.26")).toBe("2026-01-05");
  });
  it("accepts ISO and empty", () => {
    expect(parseDmy("2026-09-28")).toBe("2026-09-28");
    expect(parseDmy("")).toBe("");
    expect(parseDmy("   ")).toBe("");
  });
  it("rejects impossible or partial dates", () => {
    expect(parseDmy("31/02/2026")).toBeNull();
    expect(parseDmy("13/13/2026")).toBeNull();
    expect(parseDmy("2809202")).toBeNull();
    expect(parseDmy("2026-02-30")).toBeNull();
    expect(parseDmy("abc")).toBeNull();
  });
});
