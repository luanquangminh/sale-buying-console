import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { DOCUMENT_SCHEMA, INSTRUCTION, TEXT_NOTE } from "./ai/schema";
import { extractJson, normalise } from "./ai/validate";
import type { AppEnv, Bindings } from "./types";

/*
 * POST /api/ai/parse-document
 * Body: { text?: string, images?: string[] (data URLs), fileName?: string }
 *       or the legacy { mediaType, base64 } shape.
 * Provider order: AI_PROVIDER (default workers-ai), then any other provider with credentials.
 */

const MAX_TEXT_CHARS = 60_000;
const MAX_IMAGES = 8;
const MAX_IMAGE_CHARS = 6 * 1024 * 1024; // ~4.5 MB of JPEG per page

type Input = { text?: string; images?: string[]; fileName?: string; page?: number; pageCount?: number };
type Provider = "workers-ai" | "anthropic" | "gemini";

const RETRY_NOTE = "Your previous reply was not valid JSON matching the shape. Reply with the JSON object only.";

function textPrompt(text: string, retry: boolean): string {
  return `${INSTRUCTION}\n\n${TEXT_NOTE}${retry ? `\n\n${RETRY_NOTE}` : ""}\n\n<document>\n${text}\n</document>`;
}

/* ---------- Workers AI ---------- */

async function runWorkersAi(env: Bindings, input: Input, retry: boolean): Promise<unknown> {
  if (!env.AI) throw new Error("Workers AI binding is not configured");
  const response_format = { type: "json_schema", json_schema: DOCUMENT_SCHEMA } as const;
  if (input.text) {
    const model = env.WORKERS_AI_TEXT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const out = (await env.AI.run(model as any, {
      messages: [
        { role: "system", content: "You extract line items from trade documents and answer with JSON only." },
        { role: "user", content: textPrompt(input.text, retry) },
      ],
      response_format,
      max_tokens: 4096,
      temperature: 0.15,
      repetition_penalty: 1.1,
    } as any)) as { response?: unknown };
    return out.response;
  }
  const model = env.WORKERS_AI_VISION_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";
  const pageNote = input.page && input.pageCount && input.pageCount > 1
    ? ` This image is page ${input.page} of ${input.pageCount}; return only the product lines visible on this page, and leave header fields empty if they are not on this page.`
    : "";
  const content: unknown[] = [{ type: "text", text: `${INSTRUCTION}${pageNote}${retry ? `\n\n${RETRY_NOTE}` : ""}` }];
  for (const url of input.images || []) content.push({ type: "image_url", image_url: { url } });
  const out = (await env.AI.run(model as any, {
    messages: [{ role: "user", content }],
    response_format,
    max_tokens: 4096,
    temperature: 0.15,
    repetition_penalty: 1.1,
  } as any)) as { response?: unknown };
  return out.response;
}

/* ---------- Anthropic ---------- */

async function runAnthropic(env: Bindings, input: Input, retry: boolean): Promise<unknown> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  const parts: any[] = [];
  for (const url of input.images || []) {
    const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(url);
    if (m) parts.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  parts.push({ type: "text", text: input.text ? textPrompt(input.text, retry) : `${INSTRUCTION}${retry ? `\n\n${RETRY_NOTE}` : ""}` });
  const msg = await client.messages.create({
    model: env.ANTHROPIC_MODEL || "claude-opus-5",
    max_tokens: 8000,
    messages: [{ role: "user", content: parts }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
}

/* ---------- Gemini (optional; untested here, see research notes) ---------- */

async function runGemini(env: Bindings, input: Input, retry: boolean): Promise<unknown> {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const parts: any[] = [];
  for (const url of input.images || []) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  parts.push({ text: input.text ? textPrompt(input.text, retry) : `${INSTRUCTION}${retry ? `\n\n${RETRY_NOTE}` : ""}` });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  return json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("\n");
}

/* ---------- orchestration ---------- */

function providers(env: Bindings): Provider[] {
  const primary = (env.AI_PROVIDER || "workers-ai") as Provider;
  const available: Provider[] = [];
  if (env.AI) available.push("workers-ai");
  if (env.ANTHROPIC_API_KEY) available.push("anthropic");
  if (env.GEMINI_API_KEY) available.push("gemini");
  return [primary, ...available.filter((p) => p !== primary)].filter((p) => available.includes(p));
}

const RUNNERS: Record<Provider, (env: Bindings, input: Input, retry: boolean) => Promise<unknown>> = {
  "workers-ai": runWorkersAi,
  anthropic: runAnthropic,
  gemini: runGemini,
};

export const aiApp = new Hono<AppEnv>();

aiApp.post("/parse-document", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const input: Input = {
    fileName: typeof body.fileName === "string" ? body.fileName : undefined,
    page: typeof body.page === "number" ? body.page : undefined,
    pageCount: typeof body.pageCount === "number" ? body.pageCount : undefined,
  };

  if (typeof body.text === "string" && body.text.trim()) {
    input.text = body.text.slice(0, MAX_TEXT_CHARS);
  } else if (Array.isArray(body.images) && body.images.length) {
    const images = body.images.filter((u): u is string => typeof u === "string" && u.startsWith("data:image/"));
    if (!images.length) return c.json({ ok: false, error: "No usable page images" }, 400);
    if (images.length > MAX_IMAGES) return c.json({ ok: false, error: `Too many pages (max ${MAX_IMAGES})` }, 413);
    if (images.some((u) => u.length > MAX_IMAGE_CHARS)) return c.json({ ok: false, error: "A page image is too large" }, 413);
    input.images = images;
  } else if (typeof body.base64 === "string" && typeof body.mediaType === "string" && body.mediaType.startsWith("image/")) {
    input.images = [`data:${body.mediaType};base64,${body.base64}`];
  } else {
    return c.json({ ok: false, error: "Send { text } or { images: [dataUrl] }" }, 400);
  }

  const chain = providers(c.env);
  if (!chain.length) return c.json({ ok: false, error: "No document-parsing provider is configured (Workers AI binding, ANTHROPIC_API_KEY or GEMINI_API_KEY)" }, 503);

  const errors: string[] = [];
  for (const provider of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await RUNNERS[provider](c.env, input, attempt > 0);
        const { parsed, warnings } = normalise(extractJson(raw));
        if (parsed.lines.length === 0 && attempt === 0) continue;
        return c.json({ ok: true, parsed, warnings, provider });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const message = /3036|4006|neuron/i.test(raw)
          ? "the free daily AI allowance is used up; it resets at 00:00 UTC — Claude or ChatGPT via the AI agent link tab has no daily limit"
          : raw;
        errors.push(`${provider}: ${message}`);
        console.error("parse-document", provider, attempt, message);
        if (!/json/i.test(message)) break; // provider/quota error: move on to the next provider
      }
    }
  }
  return c.json({ ok: false, error: errors.join(" | ") || "Could not read that document" }, 502);
});
