import { Router } from "express";
import { z } from "zod";
import { UserAiKey } from "../models.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";
import { decryptApiKey, saveUserAiKey } from "../aiKeys.js";

export const aiKeysRouter = Router();

const PROVIDERS = ["google", "openai", "groq", "anthropic"] as const;
type Provider = typeof PROVIDERS[number];

const SaveKey = z.object({
  apiKey: z.string().min(10).max(500),
  provider: z.enum(PROVIDERS).default("google"),
});

const adminOnly = [requireAuth, requireRole("admin", "super_admin")] as const;

async function checkGeminiKey(apiKey: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply: OK" }] }],
      generationConfig: { maxOutputTokens: 4, temperature: 0 },
    }),
  });
  return parseCheck(r, "Gemini");
}

async function checkOpenAIKey(apiKey: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply: OK" }],
      max_tokens: 4, temperature: 0,
    }),
  });
  return parseCheck(r, "OpenAI");
}

async function checkGroqKey(apiKey: string) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: "Reply: OK" }],
      max_tokens: 4, temperature: 0,
    }),
  });
  return parseCheck(r, "Groq");
}

async function checkAnthropicKey(apiKey: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 4,
      messages: [{ role: "user", content: "Reply: OK" }],
    }),
  });
  return parseCheck(r, "Anthropic");
}

async function parseCheck(r: Response, label: string) {
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const message = (data as any)?.error?.message || (data as any)?.error?.type || (data as any)?.error || `${label} key check failed`;
    const status = r.status === 429 ? "limited" : "invalid";
    return { ok: false, status, httpStatus: r.status, message: String(message) };
  }
  return { ok: true, status: "active", httpStatus: r.status, message: `${label} key is active`, usage: (data as any)?.usage || (data as any)?.usageMetadata };
}

function serializeKey(row: any) {
  return {
    id: String(row._id),
    provider: row.provider,
    keyPreview: row.keyPreview,
    status: row.status,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

aiKeysRouter.get("/", ...adminOnly, async (req: AuthedRequest, res) => {
  const rows = await UserAiKey.find({ userId: req.user!.id }).sort({ status: 1, updatedAt: 1 }).lean();
  const keys = rows.map(serializeKey);
  res.json({ key: keys[0] ?? null, keys });
});

aiKeysRouter.post("/", ...adminOnly, async (req: AuthedRequest, res) => {
  try {
    const parsed = SaveKey.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const key = await saveUserAiKey(req.user!.id, parsed.data.apiKey, parsed.data.provider);
    res.json({ key });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Could not save AI API key" });
  }
});

async function runCheck(provider: Provider, apiKey: string) {
  if (provider === "openai") return checkOpenAIKey(apiKey);
  if (provider === "groq") return checkGroqKey(apiKey);
  if (provider === "anthropic") return checkAnthropicKey(apiKey);
  return checkGeminiKey(apiKey);
}

aiKeysRouter.post("/check", ...adminOnly, async (req: AuthedRequest, res) => {
  const rows = await UserAiKey.find({ userId: req.user!.id }).sort({ updatedAt: 1 });
  if (!rows.length) return res.status(404).json({ error: "No API key saved" });

  const checks = [];
  for (const row of rows) {
    const decryptedKey = decryptApiKey(row.encryptedKey);
    const result = await runCheck((row.provider as Provider) || "google", decryptedKey);
    row.status = result.status;
    row.lastError = result.ok ? null : result.message;
    await row.save();
    checks.push({ id: String(row._id), provider: row.provider, keyPreview: row.keyPreview, ...result });
  }
  res.json({ check: checks[0], checks });
});

aiKeysRouter.delete("/", ...adminOnly, async (req: AuthedRequest, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  await UserAiKey.deleteMany({ userId: req.user!.id, ...(id ? { _id: id } : {}) });
  res.json({ ok: true });
});
