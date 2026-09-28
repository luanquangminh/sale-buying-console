/* Name suggestions: what was typed before is offered again, so it is picked rather than retyped. */

/** Distinct non-empty names, first spelling kept, sorted A→Z without regard to case. */
export function uniqueNames(values) {
  const seen = new Map();
  for (const v of values) {
    const name = String(v || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Names containing the typed text, those starting with it first. The text itself is never offered back. */
export function matchNames(names, typed) {
  const q = String(typed || "").trim().toLowerCase();
  if (!q) return names;
  const hits = names.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q);
  return [...hits.filter((n) => n.toLowerCase().startsWith(q)), ...hits.filter((n) => !n.toLowerCase().startsWith(q))];
}
