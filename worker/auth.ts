import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { nowIso } from "./db";
import type { AppEnv, User } from "./types";

const SESSION_DAYS = 30;
const COOKIE = "sid";

type AccountRecord = { id: string; role: User["role"]; name: string; username: string; password: string };

export type { AccountRecord };

export async function findAccount(db: D1Database, username: string, password: string): Promise<AccountRecord | null> {
  const { results } = await db.prepare("SELECT data FROM records WHERE kind = 'accounts'").all<{ data: string }>();
  const wanted = username.trim().toLowerCase();
  for (const row of results) {
    const acc = JSON.parse(row.data) as AccountRecord;
    if (String(acc.username || "").trim().toLowerCase() === wanted && acc.password === password) return acc;
  }
  return null;
}

/** Resolve the session cookie to the current account, or null. */
export async function currentUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT s.expires_at AS expires_at, r.data AS data
       FROM sessions s JOIN records r ON r.kind = 'accounts' AND r.id = s.account_id
      WHERE s.token = ?`,
  )
    .bind(token)
    .first<{ expires_at: string; data: string }>();
  if (!row || row.expires_at < nowIso()) return null;
  const acc = JSON.parse(row.data) as AccountRecord;
  return { id: acc.id, name: acc.name, role: acc.role };
}

export const authApp = new Hono<AppEnv>();

authApp.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const acc = username && password ? await findAccount(c.env.DB, username, password) : null;
  if (!acc) return c.json({ ok: false, error: "Wrong username or password." }, 401);

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await c.env.DB.prepare("INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, acc.id, nowIso(), expires)
    .run();
  setCookie(c, COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: c.env.COOKIE_SECURE !== "false",
    maxAge: SESSION_DAYS * 86400,
  });
  return c.json({ ok: true, user: { id: acc.id, name: acc.name, role: acc.role } });
});

authApp.post("/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authApp.get("/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ ok: false, error: "Not signed in" }, 401);
  return c.json({ ok: true, user });
});
