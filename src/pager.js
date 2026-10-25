/* Paging for the list screens: a long list shows one page at a time, newest first as the store keeps it. */

export const PAGE_SIZES = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/**
 * One page of a list and where it stands. `page` is 1-based and clamped to the list, so a filter that shrinks the
 * list never leaves an empty page behind; `from`/`to` are 1-based row numbers for the "1–20 of 59" label.
 */
export function pageOf(list, page, size = DEFAULT_PAGE_SIZE) {
  const rows = list || [];
  const total = rows.length;
  const per = Math.max(1, Number(size) || DEFAULT_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / per));
  const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
  const start = (current - 1) * per;
  return { rows: rows.slice(start, start + per), page: current, pages, size: per, total, from: total ? start + 1 : 0, to: Math.min(start + per, total) };
}

/** "1–20 of 59"; "0 of 0" for an empty list. */
export const pageLabel = ({ from, to, total }) => (total ? `${from}–${to} of ${total}` : "0 of 0");

/** A pager is worth showing only when the list does not fit on one page of the smallest size. */
export const needsPager = (total) => total > PAGE_SIZES[0];
