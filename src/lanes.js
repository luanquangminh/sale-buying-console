/* Container Rate: the order lanes are listed in, under their POD; the cheapest quote. Only the view is sorted; the stored list is left as entered. */

import { numOrNull } from "./money";

const text = (v) => String(v ?? "").trim();
const compare = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** The cheapest priced quote on a lane, or null while none has a rate. */
export function bestQuote(lane) {
  const priced = ((lane && lane.quotes) || []).filter((q) => numOrNull(q.rate) !== null);
  return priced.length ? priced.reduce((a, b) => (Number(b.rate) < Number(a.rate) ? b : a)) : null;
}

/** The cheapest quote across lanes, with the lane it is on; null while none is priced. */
export function cheapestOf(lanes) {
  let out = null;
  for (const lane of lanes || []) { const quote = bestQuote(lane); if (quote && (!out || Number(quote.rate) < Number(out.quote.rate))) out = { quote, lane }; }
  return out;
}

/** Lanes A → Z by POD; lanes to the same POD by loading address, then container type. A lane with no POD goes last. */
export function sortLanesByPod(lanes) {
  return [...(lanes || [])].sort((a, b) => {
    const [pa, pb] = [text(a.pod), text(b.pod)];
    if (!pa !== !pb) return pa ? -1 : 1;
    return compare(pa, pb) || compare(text(a.loadingAddress), text(b.loadingAddress)) || compare(text(a.containerType), text(b.containerType));
  });
}

/** The lanes under their POD (trimmed, case-insensitive), PODs A → Z, each POD's lanes in the order above; lanes with no POD last under "". */
export function groupLanesByPod(lanes) {
  const groups = new Map();
  for (const lane of sortLanesByPod(lanes)) {
    const key = text(lane.pod).toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, pod: text(lane.pod), lanes: [] });
    groups.get(key).lanes.push(lane);
  }
  return [...groups.values()];
}
