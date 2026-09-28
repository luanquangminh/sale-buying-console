/* Container Rate: the order lanes are listed in. Only the view is sorted; the stored list is left as entered. */

const text = (v) => String(v ?? "").trim();
const compare = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** Lanes A → Z by POD; lanes to the same POD by loading address, then container type. A lane with no POD goes last. */
export function sortLanesByPod(lanes) {
  return [...(lanes || [])].sort((a, b) => {
    const [pa, pb] = [text(a.pod), text(b.pod)];
    if (!pa !== !pb) return pa ? -1 : 1;
    return compare(pa, pb) || compare(text(a.loadingAddress), text(b.loadingAddress)) || compare(text(a.containerType), text(b.containerType));
  });
}
