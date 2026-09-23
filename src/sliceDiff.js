/* Per-record diff of a store slice, used by syncStore to decide what to persist. */

import { stripDerived } from "./receipts";

export const SLICES = {
  customersBySale: { kind: "customers", bySale: true },
  feed: { kind: "feed" },
  pfisBySale: { kind: "pfis", bySale: true, strip: stripDerived },
  feedSale: { kind: "feedSale" },
  feedBuyerPfi: { kind: "feedBuyerPfi" },
  suppliers: { kind: "suppliers" },
  pos: { kind: "pos" },
  lanes: { kind: "lanes" },
  reorders: { kind: "reorders" },
  bookings: { kind: "bookings" },
  accounts: { kind: "accounts" },
  maiTasks: { kind: "maiTasks" },
  buyerJobs: { kind: "buyerJobs" },
  warehouseEvents: { kind: "warehouseEvents" },
};

export function flatten(name, value) {
  const out = new Map();
  if (SLICES[name].bySale) {
    for (const [saleId, list] of Object.entries(value || {})) {
      for (const record of list || []) if (record && record.id) out.set(record.id, { saleId, record });
    }
  } else {
    for (const record of value || []) if (record && record.id) out.set(record.id, { saleId: record.saleId ?? null, record });
  }
  return out;
}

/** Records that differ between prev and next, as sync changes. Identity check first, JSON second. */
export function diffSlice(name, prev, next) {
  if (prev === next) return [];
  const cfg = SLICES[name];
  const before = flatten(name, prev);
  const after = flatten(name, next);
  const changes = [];
  for (const [id, { saleId, record }] of after) {
    const old = before.get(id);
    if (old && old.record === record && old.saleId === saleId) continue;
    const data = cfg.strip ? cfg.strip(record) : record;
    if (old && old.saleId === saleId) {
      const oldData = cfg.strip ? cfg.strip(old.record) : old.record;
      if (JSON.stringify(oldData) === JSON.stringify(data)) continue;
    }
    changes.push({ kind: cfg.kind, id, saleId, data, createdAt: record.createdAt || null });
  }
  for (const id of before.keys()) if (!after.has(id)) changes.push({ kind: cfg.kind, id, deleted: true });
  return changes;
}
