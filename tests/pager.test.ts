import { describe, expect, it } from "vitest";
import { firstPage, needsPager, nextPager, pageLabel, pageOf } from "../src/pager.js";

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

describe("nextPager", () => {
  const at = { ...firstPage("a"), page: 3 };
  it("keeps the state itself when nothing moved", () => {
    expect(nextPager(at, "a", 0)).toBe(at);
  });
  it("starts a new filter text on page 1", () => {
    expect(nextPager(at, "b", 0)).toMatchObject({ page: 1, key: "b", size: at.size });
  });
  it("pulls an opened row's page into view once; paging away sticks until the row is opened again", () => {
    const pulled = nextPager(at, "a", 2);
    expect(pulled).toMatchObject({ page: 2, pulled: 2 });
    const away = { ...pulled, page: 3 };
    expect(nextPager(away, "a", 2)).toBe(away);
    const closed = nextPager(away, "a", 0);
    expect(closed).toMatchObject({ page: 3, pulled: 0 });
    expect(nextPager(closed, "a", 2)).toMatchObject({ page: 2, pulled: 2 });
  });
  it("a new filter text and an opened row in one render: the row's page wins", () => {
    expect(nextPager(at, "b", 2)).toMatchObject({ page: 2, key: "b", pulled: 2 });
  });
});
