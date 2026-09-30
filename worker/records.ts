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
  warehouseEvents: { slice: "warehouseEvents", roles: ["admin", "buyer", "warehouse"] }, // a sale rep reads and adds the customer entries marked as theirs (recordReadable, recordWritable)
  customerMemos: { slice: "customerMemos", roles: ["admin", "sale"] }, // a rep's own notes on a customer: never sent to the buyer
  paymentTracks: { slice: "paymentTracks", roles: ["admin"] }, // Customer Balance tab; add a role here and in the sidebar to open it to others
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

/** The kinds a role reaches record by record, not as a whole (see recordReadable / recordWritable). */
export const partlyAllowed = (kind: Kind, user: User) => kind === "warehouseEvents" && user.role === "sale";

/**
 * What a sale rep may read of the warehouse calendar: the entries marked as a customer's and as theirs. Supplier entries,
 * entries of another rep's customers, and entries not marked yet never leave the server for them.
 */
export const recordReadable = (kind: Kind, user: User, rec: any) =>
  partlyAllowed(kind, user) && Boolean(rec) && rec.party === "customer" && rec.saleId === user.id;

/** What a sale rep may write to the warehouse calendar: an entry of their own customers, and nothing else. */
export const recordWritable = (kind: Kind, user: User, rec: any) => recordReadable(kind, user, rec);

type Row = { kind: string; id: string; sale_id: string | null; data: string };

/** Rebuild the UI store shape from the records table. Newest first, as the UI inserts. */
export async function buildSnapshot(db: D1Database, user: User) {
  const { results } = await db
    .prepare("SELECT kind, id, sale_id, data FROM records ORDER BY created_at DESC, rowid DESC")
    .all<Row>();
  const slices: Record<string, any> = {};
  for (const cfg of Object.values(KINDS)) slices[cfg.slice] = "bySale" in cfg && cfg.bySale ? {} : [];
  for (const row of results) {
    if (!isKind(row.kind)) continue;
    const full = kindAllowed(row.kind, user);
    if (!full && !partlyAllowed(row.kind, user)) continue;
    const cfg = KINDS[row.kind];
    let rec = JSON.parse(row.data);
    if (!full && !recordReadable(row.kind, user, rec)) continue;
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
