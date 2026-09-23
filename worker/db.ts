export const nowIso = () => new Date().toISOString();

export async function getVersion(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'version'").first<{ value: number }>();
  return Number(row?.value ?? 0);
}

export const bumpVersion = (db: D1Database) =>
  db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'version'");
