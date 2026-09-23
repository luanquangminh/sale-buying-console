export type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  AI?: Ai;
  COOKIE_SECURE?: string;
  AI_PROVIDER?: string;
  WORKERS_AI_TEXT_MODEL?: string;
  WORKERS_AI_VISION_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  MCP_API_KEY?: string;
};

export type User = { id: string; name: string; role: "admin" | "buyer" | "sale" | "warehouse" };
export type Variables = { user: User };
export type AppEnv = { Bindings: Bindings; Variables: Variables };
