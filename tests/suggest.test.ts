import { describe, expect, it } from "vitest";
import { matchNames, uniqueNames } from "../src/suggest.js";

describe("uniqueNames", () => {
  it("drops blanks and repeats, whatever the case or spacing, and sorts A to Z", () => {
    expect(uniqueNames(["Maersk", " maersk ", "", null, undefined, "CMA CGM", "anchor Freight", "MAERSK"]))
      .toEqual(["anchor Freight", "CMA CGM", "Maersk"]);
  });
  it("is empty when nothing was typed before", () => {
    expect(uniqueNames([])).toEqual([]);
    expect(uniqueNames(["", "  "])).toEqual([]);
  });
});

describe("matchNames", () => {
  const names = ["Anchor Freight", "CMA CGM", "Maersk", "Sea Maersk Lines"];
  it("offers every name while the box is empty", () => {
    expect(matchNames(names, "")).toEqual(names);
    expect(matchNames(names, "   ")).toEqual(names);
  });
  it("narrows as letters are typed, names starting with them first", () => {
    expect(matchNames(names, "mae")).toEqual(["Maersk", "Sea Maersk Lines"]);
    expect(matchNames(names, "CM")).toEqual(["CMA CGM"]);
    expect(matchNames(names, "zzz")).toEqual([]);
  });
  it("does not offer back what is already in the box", () => {
    expect(matchNames(names, "maersk")).toEqual(["Sea Maersk Lines"]);
    expect(matchNames(names, "CMA CGM")).toEqual([]);
  });
});
