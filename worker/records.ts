import type { User } from "./types";

/** Record kinds = the slices of the UI store. `bySale` slices are keyed by sale id in the UI. */
export const KINDS = {
  customers: { slice: "customersBySale", bySale: true },
  feed: { slice: "feed" },
  pfis: { slice: "pfisBySale", bySale: true },
  feedSale: { slice: "feedSale" },
  feedBuyerPfi: { slice: "feedBuyerPfi" },
  suppliers: { slice: "suppliers" },
  pos: { slice: "pos" },
  lanes: { slice: "lanes" },
  reorders: { slice: "reorders" },
  bookings: { slice: "bookings" },
  accounts: { slice: "accounts", ascending: true },
  maiTasks: { slice: "maiTasks", roles: ["admin"] },
  buyerJobs: { slice: "buyerJobs", roles: ["admin", "buyer"] },
  warehouseEvents: { slice: "warehouseEvents", roles: ["admin", "buyer", "warehouse"] },
} as const;

export type Kind = keyof typeof KINDS;
export const isKind = (k: unknown): k is Kind => typeof k === "string" && k in KINDS;
/** A kind with `roles` is neither sent to nor accepted from any other role. */
export const kindAllowed = (kind: Kind, user: User) => {
  const cfg = KINDS[kind];
  const roles = "roles" in cfg ? (cfg.roles as readonly string[]) : null;
  if (user.role === "warehouse") return kind === "accounts" || (roles !== null && roles.includes("warehouse")); // the calendar and names only
  return roles === null || roles.includes(user.role);
};

type Row = { kind: string; id: string; sale_id: string | null; data: string };

/** Rebuild the UI store shape from the records table. Newest first, as the UI inserts. */
export async function buildSnapshot(db: D1Database, user: User) {
  const { results } = await db
    .prepare("SELECT kind, id, sale_id, data FROM records ORDER BY created_at DESC, rowid DESC")
    .all<Row>();
  const slices: Record<string, any> = {};
  for (const cfg of Object.values(KINDS)) slices[cfg.slice] = "bySale" in cfg && cfg.bySale ? {} : [];
  for (const row of results) {
    if (!isKind(row.kind) || !kindAllowed(row.kind, user)) continue;
    const cfg = KINDS[row.kind];
    let rec = JSON.parse(row.data);
    if (row.kind === "accounts" && user.role !== "admin") {
      const { password: _omit, ...rest } = rec;
      rec = rest;
    }
    if ("bySale" in cfg && cfg.bySale) {
      const key = row.sale_id ?? "";
      (slices[cfg.slice][key] ||= []).push(rec);
    } else {
      slices[cfg.slice].push(rec);
    }
  }
  slices.accounts.reverse(); // the UI appends accounts in creation order
  return slices;
}
