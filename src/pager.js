/* Paging for the list screens: a long list shows one page at a time, newest first as the store keeps it. */

export const PAGE_SIZES = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/**
 * One page of a list and where it stands. `page` is 1-based and clamped to the list, so a filter that shrinks the
 * list never leaves an empty page behind; `from`/`to` are 1-based row numbers for the "1–20 of 59" label.
 */
export function pageOf(list, page, size) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { rows: list.slice(start, start + size), page: current, pages, size, total, from: start + 1, to: Math.min(start + size, total) };
}

/** "1–20 of 59". */
export const pageLabel = ({ from, to, total }) => `${from}–${to} of ${total}`;

/** A pager is worth showing only when the list does not fit on one page of the smallest size. */
export const needsPager = (total) => total > PAGE_SIZES[0];
