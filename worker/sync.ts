import { bumpVersion, getVersion, nowIso } from "./db";
import { isKind } from "./records";
import { mergeOtherRole } from "../src/merge.js";
import type { User } from "./types";

export type Change = {
  kind: string;
  id: string;
  saleId?: string | null;
  data?: unknown;
  deleted?: boolean;
  createdAt?: string | null;
  viewAs?: string; // pfis only: which role's view produced this write (admin sessions act as either)
};

/** Which role's fields this PFI write owns; null = write the record as sent. */
function pfiWriteRole(ch: Change, user?: User): "sale" | "buyer" | null {
  if (!user || ch.kind !== "pfis" || ch.deleted || !ch.data) return null;
  if (user.role === "sale" || user.role === "buyer") return user.role;
  return ch.viewAs === "sale" || ch.viewAs === "buyer" ? ch.viewAs : null;
}

/** A PFI is edited by Sale and Buyer on disjoint fields: keep the other role's fields from the stored copy. */
async function mergePfiWrites(db: D1Database, changes: Change[], user?: User) {
  const merges = changes.filter((ch) => pfiWriteRole(ch, user));
  for (let i = 0; i < merges.length; i += 50) {
    const chunk = merges.slice(i, i + 50);
    const { results } = await db
      .prepare(`SELECT id, data FROM records WHERE kind = 'pfis' AND id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk.map((ch) => ch.id))
      .all<{ id: string; data: string }>();
    const stored = new Map(results.map((r) => [r.id, JSON.parse(r.data)]));
    for (const ch of chunk) {
      const current = stored.get(ch.id);
      if (current) ch.data = mergeOtherRole(ch.data, current, pfiWriteRole(ch, user));
    }
  }
}

const ID_RE = /^[A-Za-z0-9][\w\-:.]{0,120}$/;

/** Upsert / delete records in chunks, then bump the change counter. Returns the new version. */
export async function applyChanges(db: D1Database, changes: Change[], user?: User): Promise<number> {
  await mergePfiWrites(db, changes, user);
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  for (const ch of changes) {
    if (!isKind(ch.kind) || typeof ch.id !== "string" || !ID_RE.test(ch.id)) {
      throw new Error(`Invalid change: ${JSON.stringify({ kind: ch.kind, id: ch.id })}`);
    }
    if (ch.deleted) {
      stmts.push(db.prepare("DELETE FROM records WHERE kind = ? AND id = ?").bind(ch.kind, ch.id));
    } else {
      stmts.push(
        db
          .prepare(
            `INSERT INTO records (kind, id, sale_id, created_at, updated_at, data)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(kind, id) DO UPDATE SET
               sale_id = excluded.sale_id, updated_at = excluded.updated_at, data = excluded.data`,
          )
          .bind(ch.kind, ch.id, ch.saleId ?? null, ch.createdAt || now, now, JSON.stringify(ch.data ?? {})),
      );
    }
  }
  stmts.push(bumpVersion(db));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return getVersion(db);
}
