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
  expectedPayments: { slice: "expectedPayments", roles: ["admin", "accountant"] }, // Payments Received: what a rep says is coming; the rep reads and writes their own (partlyAllowed)
  receivedPayments: { slice: "receivedPayments", roles: ["admin", "accountant"] }, // what the bank showed; a rep reads the ones confirming their own expected payments
} as const;

export type Kind = keyof typeof KINDS;
export const isKind = (k: unknown): k is Kind => typeof k === "string" && k in KINDS;
/** A kind with `roles` is neither sent to nor accepted from any other role. */
/** Roles that get the account names (to show who did what) and their own kinds, nothing else. */
const NAMES_ONLY = new Set(["warehouse", "accountant"]);
export const kindAllowed = (kind: Kind, user: User) => {
  const cfg = KINDS[kind];
  const roles = "roles" in cfg ? (cfg.roles as readonly string[]) : null;
  if (NAMES_ONLY.has(user.role)) return kind === "accounts" || (roles !== null && roles.includes(user.role));
  return roles === null || roles.includes(user.role);
};
/** What a role may write as a whole kind: the names a names-only role reads are not theirs to change. */
export const kindWritable = (kind: Kind, user: User) => kindAllowed(kind, user) && !(NAMES_ONLY.has(user.role) && kind === "accounts");

/** The kinds a role reaches record by record, not as a whole (see recordReadable / recordWritable). */
const PARTLY: Partial<Record<Kind, readonly string[]>> = { warehouseEvents: ["sale"], expectedPayments: ["sale"], receivedPayments: ["sale"] };
export const partlyAllowed = (kind: Kind, user: User) => Boolean(PARTLY[kind] && PARTLY[kind]!.includes(user.role));

/**
 * What a sale rep may read of a kind they reach record by record:
 * - the warehouse calendar: the entries marked as a customer's and as theirs; supplier entries, another rep's, and unmarked ones never leave the server for them;
 * - expected payments: their own;
 * - received payments: the ones confirming one of their own expected payments (`ownExpected` holds those ids), never the unannounced money.
 */
export const recordReadable = (kind: Kind, user: User, rec: any, ownExpected?: Set<string>) => {
  if (!partlyAllowed(kind, user) || !rec) return false;
  if (kind === "warehouseEvents") return rec.party === "customer" && rec.saleId === user.id;
  if (kind === "expectedPayments") return rec.saleId === user.id;
  if (kind === "receivedPayments") return Boolean(rec.expectedId) && Boolean(ownExpected && ownExpected.has(rec.expectedId));
  return false;
};

/** What a sale rep may write: an entry of their own customers, an expected payment of their own; what the bank showed is the accountant's. */
export const recordWritable = (kind: Kind, user: User, rec: any) => {
  if (!partlyAllowed(kind, user) || !rec) return false;
  if (kind === "warehouseEvents") return rec.party === "customer" && rec.saleId === user.id;
  if (kind === "expectedPayments") return rec.saleId === user.id;
  return false;
};

type Row = { kind: string; id: string; sale_id: string | null; data: string };

/** Rebuild the UI store shape from the records table. Newest first, as the UI inserts. */
export async function buildSnapshot(db: D1Database, user: User) {
  const { results } = await db
    .prepare("SELECT kind, id, sale_id, data FROM records ORDER BY created_at DESC, rowid DESC")
    .all<Row>();
  const slices: Record<string, any> = {};
  for (const cfg of Object.values(KINDS)) slices[cfg.slice] = "bySale" in cfg && cfg.bySale ? {} : [];
  // a rep's received payments are the ones confirming their own expected payments: know those first (parsed once)
  const ownExpected = new Set<string>(); const parsed = new Map<string, any>();
  if (user.role === "sale") for (const row of results) if (row.kind === "expectedPayments") { const rec = JSON.parse(row.data); parsed.set(row.id, rec); if (rec.saleId === user.id) ownExpected.add(row.id); }
  for (const row of results) {
    if (!isKind(row.kind)) continue;
    const full = kindAllowed(row.kind, user);
    if (!full && !partlyAllowed(row.kind, user)) continue;
    const cfg = KINDS[row.kind];
    let rec = parsed.get(row.id) ?? JSON.parse(row.data);
    if (!full && !recordReadable(row.kind, user, rec, ownExpected)) continue;
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
