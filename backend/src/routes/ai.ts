// Multi-provider AI proxy with smart cross-provider fallback for stability.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";
import { env } from "../env.js";
import { getUserAiKeys, markUserAiKeyLimited } from "../aiKeys.js";

export const aiRouter = Router();

const PROVIDERS = ["google", "openai", "groq", "anthropic"] as const;
type Provider = typeof PROVIDERS[number];

const ChatBody = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.any() })),
  tools: z.any().optional(),
  tool_choice: z.any().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().int().min(1).max(8192).optional(),
  provider: z.enum([...PROVIDERS, "auto"]).optional(),
});

// Token-efficient default models per provider
const DEFAULT_MODELS: Record<Provider, string> = {
  google: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.1-8b-instant",
  anthropic: "claude-3-5-haiku-latest",
};

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => typeof p === "string" ? p : (p as any)?.text ?? JSON.stringify(p)).join("\n");
  return content == null ? "" : JSON.stringify(content);
}

function isSchemaConstraintError(message: string) {
  return /schema produces a constraint|too many states|function.*declaration|response schema/i.test(message);
}
function isKeyOrQuotaError(status: number, message: string) {
  if (status === 429 || status === 401 || status === 403) return true;
  return /api key|quota|rate limit|permission denied|exceeded|invalid/i.test(message);
}

function toOpenAITools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  const out = tools
    .filter((t: any) => t?.type === "function" && t.function?.name)
    .map((t: any) => ({ type: "function", function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters } }));
  return out.length ? out : undefined;
}
function toOpenAIToolChoice(tc: unknown) {
  const name = (tc as any)?.function?.name;
  return name ? { type: "function", function: { name } } : undefined;
}
function toGeminiTools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  const decls = tools
    .filter((t: any) => t?.type === "function" && t.function?.name)
    .map((t: any) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters }));
  return decls.length ? [{ functionDeclarations: decls }] : undefined;
}
function toGeminiToolConfig(tc: unknown) {
  const name = (tc as any)?.function?.name;
  if (!name) return undefined;
  return { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [name] } };
}
function toAnthropicTools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  const out = tools
    .filter((t: any) => t?.type === "function" && t.function?.name)
    .map((t: any) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  return out.length ? out : undefined;
}

type Normalized = { content: string; toolCalls: any[]; usage: any };

async function callProvider(provider: Provider, apiKey: string, body: z.infer<typeof ChatBody>): Promise<{ ok: boolean; status: number; data: any; normalized?: Normalized }> {
  const messages = body.messages.map(m => ({ role: m.role, content: toText(m.content) }));
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.2;
  const max_tokens = body.max_tokens ?? 2048;
  const oaTools = toOpenAITools(body.tools);
  const oaChoice = toOpenAIToolChoice(body.tool_choice);

  if (provider === "openai" || provider === "groq") {
    const model = provider === "groq" ? "llama-3.1-8b-instant" : "gpt-4o-mini";
    const url = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, messages, temperature, max_tokens,
        ...(oaTools ? { tools: oaTools, tool_choice: oaChoice || "auto" } : {}),
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, status: r.status, data };
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { ok: false, status: 502, data };
    const toolCalls = (msg.tool_calls || []).map((c: any, i: number) => ({
      id: c.id || `call_${Date.now()}_${i}`, type: "function",
      function: { name: c.function?.name, arguments: c.function?.arguments || "{}" },
    }));
    return { ok: true, status: 200, data, normalized: { content: msg.content || "", toolCalls, usage: data.usage } };
  }

  if (provider === "anthropic") {
    const systemText = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const aMessages = messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    const aTools = toAnthropicTools(body.tools);
    const toolName = (body.tool_choice as any)?.function?.name;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens, temperature,
        ...(systemText ? { system: systemText } : {}),
        messages: aMessages,
        ...(aTools ? { tools: aTools } : {}),
        ...(toolName ? { tool_choice: { type: "tool", name: toolName } } : {}),
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, status: r.status, data };
    const blocks = data?.content || [];
    let text = ""; const toolCalls: any[] = [];
    for (const b of blocks) {
      if (b.type === "text") text += b.text || "";
      else if (b.type === "tool_use") {
        toolCalls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      }
    }
    return { ok: true, status: 200, data, normalized: { content: text, toolCalls, usage: data.usage } };
  }

  // Google Gemini
  const systemText = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const contents = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const gTools = toGeminiTools(body.tools);
  const toolConfig = toGeminiToolConfig(body.tool_choice);
  const model = (body.model || "").replace(/^google\//, "") || DEFAULT_MODELS.google;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      ...(gTools ? { tools: gTools } : {}),
      ...(toolConfig ? { toolConfig } : {}),
      generationConfig: { temperature, maxOutputTokens: max_tokens },
    }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, status: r.status, data };
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const toolCalls = parts
    .map((p: any) => p.functionCall).filter((c: any) => c?.name)
    .map((c: any, i: number) => ({ id: `call_${Date.now()}_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }));
  const text = parts.map((p: any) => p.text || "").join("");
  return { ok: true, status: 200, data, normalized: { content: text, toolCalls, usage: data.usageMetadata && {
    prompt_tokens: data.usageMetadata.promptTokenCount, completion_tokens: data.usageMetadata.candidatesTokenCount, total_tokens: data.usageMetadata.totalTokenCount,
  } } };
}

aiRouter.post("/chat", requireAuth, requireRole("admin", "super_admin"), async (req: AuthedRequest, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const userKeys = await getUserAiKeys(req.user!.id);
  const requested = (parsed.data.provider || "auto") as Provider | "auto";

  // Build prioritized key list: requested provider first, then others (cross-provider fallback for stability)
  const order: Provider[] = requested === "auto"
    ? ["google", "openai", "anthropic", "groq"]
    : [requested, ...PROVIDERS.filter(p => p !== requested)];

  const queue: Array<{ provider: Provider; id: string; apiKey: string }> = [];
  for (const p of order) {
    for (const k of userKeys.filter(k => k.provider === p)) queue.push({ provider: p, id: k.id, apiKey: k.apiKey });
    if (p === "google" && env.GOOGLE_AI_API_KEY && !userKeys.some(k => k.provider === "google")) {
      queue.push({ provider: "google", id: "env", apiKey: env.GOOGLE_AI_API_KEY });
    }
  }

  if (!queue.length) {
    return res.status(402).json({ code: "AI_KEY_REQUIRED", error: "No AI API keys configured. Add a Gemini, OpenAI, Anthropic, or Groq key." });
  }

  let lastErr = "";
  let lastStatus = 500;
  for (const k of queue) {
    const result = await callProvider(k.provider, k.apiKey, parsed.data);
    if (result.ok && result.normalized) {
      return res.json({
        id: `${k.provider}-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: k.provider,
        provider: k.provider,
        choices: [{
          index: 0,
          message: { role: "assistant", content: result.normalized.content, ...(result.normalized.toolCalls.length ? { tool_calls: result.normalized.toolCalls } : {}) },
          finish_reason: "stop",
        }],
        ...(result.normalized.usage ? { usage: result.normalized.usage } : {}),
      });
    }
    const message = String(result.data?.error?.message || result.data?.error?.type || result.data?.error || `${k.provider} request failed`);
    if (isSchemaConstraintError(message)) {
      return res.status(400).json({ code: "AI_REQUEST_INVALID", error: "AI schema too complex. Simplify and retry.", detail: message });
    }
    lastErr = message;
    lastStatus = result.status;
    if (isKeyOrQuotaError(result.status, message)) {
      if (k.id !== "env") await markUserAiKeyLimited(k.id, message);
      continue;
    }
    // hard error: still try next key (stability over strictness)
    continue;
  }

  return res.status(429).json({
    code: "AI_KEY_LIMIT",
    error: "All saved AI keys are limited or invalid. Add another key to continue.",
    detail: lastErr || `last status ${lastStatus}`,
  });
});
