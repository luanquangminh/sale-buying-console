import { describe, expect, it } from "vitest";
import { fmtDate, fmtMonth, parseDmy, parseMonth } from "../src/dates.js";

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

describe("fmtMonth", () => {
  it("shows a stored month as mm/yyyy", () => {
    expect(fmtMonth("2027-03")).toBe("03/2027");
    expect(fmtMonth("2026-12")).toBe("12/2026");
  });
  it("drops the day of a full date saved before the change", () => {
    expect(fmtMonth("2027-03-15")).toBe("03/2027");
    expect(fmtMonth("2026-01-05T10:20:30.000Z")).toBe("01/2026");
  });
  it("leaves empty and unreadable values alone", () => {
    expect(fmtMonth("")).toBe("");
    expect(fmtMonth(undefined)).toBe("");
    expect(fmtMonth("soon")).toBe("soon");
  });
});

describe("parseMonth", () => {
  it("reads mm/yyyy and its everyday variants", () => {
    expect(parseMonth("03/2027")).toBe("2027-03");
    expect(parseMonth("3/2027")).toBe("2027-03");
    expect(parseMonth("3/27")).toBe("2027-03");
    expect(parseMonth("03-2027")).toBe("2027-03");
    expect(parseMonth("03.2027")).toBe("2027-03");
    expect(parseMonth(" 12/2026 ")).toBe("2026-12");
    expect(parseMonth("032027")).toBe("2027-03");
    expect(parseMonth("0327")).toBe("2027-03");
    expect(parseMonth("2027-03")).toBe("2027-03");
  });
  it("keeps only the month of a full date", () => {
    expect(parseMonth("15/03/2027")).toBe("2027-03");
    expect(parseMonth("2027-03-15")).toBe("2027-03");
    expect(parseMonth("15032027")).toBe("2027-03");
  });
  it("is empty for an emptied box and null for anything that is not a month", () => {
    expect(parseMonth("")).toBe("");
    expect(parseMonth("   ")).toBe("");
    for (const bad of ["13/2027", "00/2027", "0/27", "2027", "March 2027", "03/20277", "31/02/2027", "2027-13", "abc"]) {
      expect(parseMonth(bad)).toBe(null);
    }
  });
  it("round-trips with fmtMonth", () => {
    for (const ym of ["2026-01", "2027-03", "2030-12"]) expect(parseMonth(fmtMonth(ym))).toBe(ym);
  });
});
