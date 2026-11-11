import { describe, expect, it } from "vitest";
import { bestQuote, cheapestOf, groupLanesByPod, podKey, renamePod, sortLanesByPod, withoutPod } from "../src/lanes.js";

const lane = (pod: unknown, loadingAddress = "", containerType = "20ft Dry", quotes: any[] = []) => ({ id: `${pod}|${loadingAddress}|${containerType}`, pod, loadingAddress, containerType, quotes });
const q = (company: string, rate: unknown, currency = "USD") => ({ id: `${company}-${rate}`, company, rate, currency });
const pods = (list: any[]) => list.map((l) => l.pod);

describe("sortLanesByPod", () => {
  it("orders lanes A to Z by POD, whatever the case or the order they were entered in", () => {
    expect(pods(sortLanesByPod([lane("Tema"), lane("lagos, Apapa"), lane("Accra"), lane("Dubai, Jebel Ali"), lane("abidjan")])))
      .toEqual(["abidjan", "Accra", "Dubai, Jebel Ali", "lagos, Apapa", "Tema"]);
  });
  it("ignores spaces around the name and reads numbers as numbers", () => {
    expect(pods(sortLanesByPod([lane("Port 10"), lane("  Accra"), lane("Port 2")]))).toEqual(["  Accra", "Port 2", "Port 10"]);
  });
  it("orders lanes to the same POD by loading address, then by container", () => {
    const sorted = sortLanesByPod([
      lane("Lagos", "Northampton", "40ft Dry"),
      lane("Lagos", "Felixstowe", "40ft Dry"),
      lane("Lagos", "Northampton", "20ft Dry"),
    ]);
    expect(sorted.map((l) => `${l.loadingAddress} ${l.containerType}`)).toEqual(["Felixstowe 40ft Dry", "Northampton 20ft Dry", "Northampton 40ft Dry"]);
  });
  it("puts a lane with no POD last and copes with an empty list", () => {
    expect(pods(sortLanesByPod([lane(""), lane("Tema"), lane(undefined), lane("Accra")]))).toEqual(["Accra", "Tema", "", undefined]);
    expect(sortLanesByPod([])).toEqual([]);
    expect(sortLanesByPod(undefined)).toEqual([]);
  });
  it("leaves the stored list as it was", () => {
    const stored = [lane("Tema"), lane("Accra")];
    sortLanesByPod(stored);
    expect(pods(stored)).toEqual(["Tema", "Accra"]);
  });
});

describe("the cheapest quote", () => {
  it("on a lane: the lowest priced rate, whatever the order; none while nothing is priced", () => {
    expect(bestQuote(lane("Lagos", "", "20ft Dry", [q("Maersk", 4150), q("MSC", "3990"), q("CMA", "")]))!.company).toBe("MSC");
    expect(bestQuote(lane("Lagos", "", "20ft Dry", [q("CMA", "")]))).toBe(null);
    expect(bestQuote(lane("Lagos"))).toBe(null);
    expect(bestQuote({ id: "x" })).toBe(null);
  });
  it("across the lanes of a POD: the lowest, with the lane it sits on", () => {
    const a = lane("Lagos", "Northampton", "20ft Dry", [q("Maersk", 4150)]);
    const b = lane("Lagos", "Felixstowe", "40ft Dry", [q("MSC", 3990), q("CMA", 4300)]);
    const c = lane("Lagos", "Tilbury", "40ft Reefer");
    const best = cheapestOf([a, b, c])!;
    expect([best.quote.company, best.lane.loadingAddress]).toEqual(["MSC", "Felixstowe"]);
    expect(cheapestOf([c])).toBe(null);
    expect(cheapestOf([])).toBe(null);
    expect(cheapestOf(undefined)).toBe(null);
  });
});

describe("groupLanesByPod", () => {
  it("one group a POD, A to Z, spelling and spaces ignored, each POD's lanes by loading address then container", () => {
    const groups = groupLanesByPod([
      lane("Tema", "Northampton"), lane("lagos, Apapa", "Northampton", "40ft Dry"), lane("Lagos, Apapa ", "Felixstowe"), lane("Lagos, Apapa", "Northampton", "20ft Dry"), lane("Accra"),
    ]);
    expect(groups.map((g) => [g.key, g.pod, g.lanes.length])).toEqual([["accra", "Accra", 1], ["lagos, apapa", "Lagos, Apapa", 3], ["tema", "Tema", 1]]); // the label is the first lane's spelling in list order
    expect(groups[1].lanes.map((l) => `${l.loadingAddress.trim()} ${l.containerType}`)).toEqual(["Felixstowe 20ft Dry", "Northampton 20ft Dry", "Northampton 40ft Dry"]);
  });
  it("puts the lanes without a POD last, under an empty key, and copes with an empty list", () => {
    const groups = groupLanesByPod([lane(""), lane("Tema"), lane(undefined)]);
    expect(groups.map((g) => [g.key, g.lanes.length])).toEqual([["tema", 1], ["", 2]]);
    expect(groupLanesByPod([])).toEqual([]);
    expect(groupLanesByPod(undefined)).toEqual([]);
  });
});

describe("a POD as a whole", () => {
  const list = [lane("Lagos, Apapa", "Northampton"), lane("lagos, apapa ", "Felixstowe"), lane("Tema", "Northampton"), lane("Lagos Apapa", "Felixstowe")];
  it("keys a POD by its trimmed name, case ignored", () => { expect(podKey(" Lagos, Apapa ")).toBe("lagos, apapa"); expect(podKey(undefined)).toBe(""); });
  it("renames every lane spelt that way and no other, trimmed, so a misspelt twin joins the right POD; the rest are the same objects", () => {
    const out = renamePod(list, "lagos, apapa", " Lagos Apapa ");
    expect(pods(out)).toEqual(["Lagos Apapa", "Lagos Apapa", "Tema", "Lagos Apapa"]);
    expect(out[0]).not.toBe(list[0]); expect(out[2]).toBe(list[2]); expect(out[3]).toBe(list[3]);
    expect(groupLanesByPod(out).map((g) => [g.pod, g.lanes.length])).toEqual([["Lagos Apapa", 3], ["Tema", 1]]);
    expect(pods(list)).toEqual(["Lagos, Apapa", "lagos, apapa ", "Tema", "Lagos Apapa"]); // the stored list untouched
    expect(renamePod(list, "tema", "Tema")[2]).toBe(list[2]); // spelt so already: nothing to save
    expect(renamePod(undefined, "tema", "Tema")).toEqual([]);
  });
  it("drops the lanes of one POD only", () => {
    expect(pods(withoutPod(list, "lagos, apapa"))).toEqual(["Tema", "Lagos Apapa"]);
    expect(withoutPod(list, "nowhere")).toHaveLength(4);
    expect(withoutPod(undefined, "x")).toEqual([]);
  });
});
