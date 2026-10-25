import type { User } from "./types";

/** The roles that use the console as a whole. The others (warehouse, accountant) get the account names and their own kinds only. */
export const FULL_ROLES: readonly string[] = ["admin", "buyer", "sale"];
const EVERYONE: readonly string[] = [...FULL_ROLES, "warehouse", "accountant"];

/**
 * Record kinds = the slices of the UI store. `roles` says who reads the kind (every full role when absent), `write` who writes it
 * (the readers when absent); `bySale` slices are keyed by sale id in the UI. A rep reaches some kinds record by record: see PARTLY.
 */
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
  accounts: { slice: "accounts", ascending: true, roles: EVERYONE, write: ["admin"] }, // names for everyone (who did what); the logins are the admin's
  maiTasks: { slice: "maiTasks", roles: ["admin"] },
  buyerJobs: { slice: "buyerJobs", roles: ["admin", "buyer"] },
  warehouseEvents: { slice: "warehouseEvents", roles: ["admin", "buyer", "warehouse"] },
  customerMemos: { slice: "customerMemos", roles: ["admin", "sale"] }, // a rep's own notes on a customer: never sent to the buyer
  paymentTracks: { slice: "paymentTracks", roles: ["admin"] }, // Customer Balance tab; add a role here and in the sidebar to open it to others
  expectedPayments: { slice: "expectedPayments", roles: ["admin", "accountant"] }, // Payments Received: what a rep says is coming
  receivedPayments: { slice: "receivedPayments", roles: ["admin", "accountant"] }, // what the bank showed
} as const;

export type Kind = keyof typeof KINDS;
export const isKind = (k: unknown): k is Kind => typeof k === "string" && k in KINDS;
const readRoles = (kind: Kind): readonly string[] => ("roles" in KINDS[kind] ? (KINDS[kind] as any).roles : FULL_ROLES);
/** May this role read the kind as a whole? */
export const kindAllowed = (kind: Kind, user: User) => readRoles(kind).includes(user.role);
/** May this role write the kind as a whole? */
export const kindWritable = (kind: Kind, user: User) => (("write" in KINDS[kind] ? (KINDS[kind] as any).write : readRoles(kind)) as readonly string[]).includes(user.role);

/**
 * The kinds a role reaches record by record: `own` says which records are theirs, `write` whether they may write those.
 * A sale rep: the calendar entries of their own customers; their own expected payments; the receipts confirming them
 * (the sync route stamps the rep on each receipt), never the unannounced money nor the accountant's side to write.
 */
const PARTLY: Partial<Record<Kind, { roles: readonly string[]; own: (rec: any, user: User) => boolean; write: boolean }>> = {
  warehouseEvents: { roles: ["sale"], own: (rec, u) => rec.party === "customer" && rec.saleId === u.id, write: true },
  expectedPayments: { roles: ["sale"], own: (rec, u) => rec.saleId === u.id, write: true },
  receivedPayments: { roles: ["sale"], own: (rec, u) => Boolean(rec.expectedId) && rec.saleId === u.id, write: false },
};
export const partlyAllowed = (kind: Kind, user: User) => Boolean(PARTLY[kind]?.roles.includes(user.role));
export const recordReadable = (kind: Kind, user: User, rec: any) => partlyAllowed(kind, user) && Boolean(rec) && PARTLY[kind]!.own(rec, user);
export const recordWritable = (kind: Kind, user: User, rec: any) => Boolean(PARTLY[kind]?.write) && recordReadable(kind, user, rec);

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
