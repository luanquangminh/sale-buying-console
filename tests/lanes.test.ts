import { describe, expect, it } from "vitest";
import { sortLanesByPod } from "../src/lanes.js";

const lane = (pod: unknown, loadingAddress = "", containerType = "20ft Dry") => ({ id: `${pod}|${loadingAddress}|${containerType}`, pod, loadingAddress, containerType, quotes: [] });
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
