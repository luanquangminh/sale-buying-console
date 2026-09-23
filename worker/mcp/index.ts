/*
 * Remote MCP endpoint (Streamable HTTP) so Claude, ChatGPT or Claude Code can read a document
 * in chat and push its lines into a PFI / PO through tools.
 *   POST /mcp        JSON-RPC (initialize, tools/list, tools/call)
 *   GET  /mcp        help page in a browser; SSE stream for MCP clients that ask for it
 * API key = "<username>:<password>" of an app account, or the MCP_API_KEY secret (acts as admin).
 * Sent as X-API-Key, Authorization: Bearer, or ?key=.
 */
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { findAccount } from "../auth";
import type { AppEnv, Bindings, User } from "../types";
import { helpPage } from "./help";
import { buildServer } from "./tools";

async function resolveUser(env: Bindings, key: string | undefined): Promise<User | null> {
  if (!key) return null;
  if (env.MCP_API_KEY && key === env.MCP_API_KEY) return { id: "admin-01", name: "MCP", role: "admin" };
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const acc = await findAccount(env.DB, key.slice(0, i), key.slice(i + 1));
  return acc ? { id: acc.id, name: acc.name, role: acc.role } : null;
}

const readKey = (c: any): string | undefined => {
  const h = c.req.header("x-api-key");
  if (h) return h.trim();
  const auth = c.req.header("authorization");
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return c.req.query("key") || undefined;
};

export const mcpApp = new Hono<AppEnv>();

const handle = async (c: any) => {
  const user = await resolveUser(c.env, readKey(c));
  if (user && user.role === "warehouse") return c.json({ jsonrpc: "2.0", error: { code: -32001, message: "MCP tools are not available to warehouse accounts" }, id: null }, 403);
  if (!user) {
    return c.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: send X-API-Key (or Authorization: Bearer, or ?key=) with <username>:<password> of an app account" }, id: null }, 401);
  }
  const server = buildServer(c.env, user);
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(c);
};

mcpApp.get("/", (c) => {
  const accept = c.req.header("accept") || "";
  if (accept.includes("text/event-stream")) return handle(c);
  return c.html(helpPage(new URL(c.req.url).origin));
});
mcpApp.post("/", handle);
mcpApp.delete("/", handle);
