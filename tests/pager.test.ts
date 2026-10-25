import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, needsPager, pageLabel, pageOf } from "../src/pager.js";

const list = Array.from({ length: 59 }, (_, i) => i + 1);

describe("pageOf", () => {
  it("slices one page and says where it stands", () => {
    expect(pageOf(list, 1, 20)).toMatchObject({ page: 1, pages: 3, size: 20, total: 59, from: 1, to: 20 });
    expect(pageOf(list, 1, 20).rows).toEqual(list.slice(0, 20));
    expect(pageOf(list, 3, 20)).toMatchObject({ page: 3, from: 41, to: 59 });
    expect(pageOf(list, 3, 20).rows).toEqual(list.slice(40));
  });
  it("clamps the page to the list, so a shrunken list never shows an empty page", () => {
    expect(pageOf(list, 9, 20)).toMatchObject({ page: 3, from: 41, to: 59 });
    expect(pageOf(list, 0, 20)).toMatchObject({ page: 1 });
    expect(pageOf(list, -2, 20)).toMatchObject({ page: 1 });
    expect(pageOf(list.slice(0, 5), 3, 20)).toMatchObject({ page: 1, pages: 1, from: 1, to: 5 });
  });
  it("copes with an empty list", () => {
    expect(pageOf([], 1, 20)).toMatchObject({ rows: [], page: 1, pages: 1, total: 0 });
  });
  it("starts on the smallest page size", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(PAGE_SIZES[0]);
  });
});

describe("pageLabel and needsPager", () => {
  it("words the position", () => {
    expect(pageLabel(pageOf(list, 2, 20))).toBe("21–40 of 59");
    expect(pageLabel(pageOf(list, 3, 20))).toBe("41–59 of 59");
  });
  it("shows a pager only past the smallest page", () => {
    expect(needsPager(20)).toBe(false);
    expect(needsPager(21)).toBe(true);
    expect(needsPager(0)).toBe(false);
  });
});
