import { describe, expect, it } from "vitest";
import { placePanel } from "../src/popup.js";

const viewport = { width: 1400, height: 900 };
const panel = { width: 260, height: 236 };
const box = (top: number, left = 300, height = 28) => ({ top, bottom: top + height, left });

describe("placePanel", () => {
  it("opens under the anchor while there is room", () => {
    expect(placePanel(box(200), viewport, panel)).toEqual({ left: 300, top: 232 });
    expect(placePanel(box(900 - 28 - 4 - 236), viewport, panel)).toEqual({ left: 300, top: 900 - 4 - 236 + 4 }); // fits exactly
  });
  it("opens above the anchor near the bottom of the window", () => {
    expect(placePanel(box(850), viewport, panel)).toEqual({ left: 300, bottom: 900 - 850 + 4 });
    expect(placePanel(box(700), viewport, panel)).toEqual({ left: 300, bottom: 204 });
  });
  it("takes the larger side when neither fits", () => {
    const small = { width: 1400, height: 300 };
    expect(placePanel(box(60), small, panel)).toEqual({ left: 300, top: 92 }); // more room below
    expect(placePanel(box(220), small, panel)).toEqual({ left: 300, bottom: 84 }); // more room above
  });
  it("keeps the panel inside the window sideways", () => {
    expect(placePanel(box(200, 1300), viewport, panel).left).toBe(1400 - 260 - 16);
    expect(placePanel(box(200, -20), viewport, panel).left).toBe(8);
  });
});
