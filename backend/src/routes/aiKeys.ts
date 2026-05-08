import { Router } from "express";
import { z } from "zod";
import { Agent } from "undici";
import { UserAiKey } from "../models.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";
import { decryptApiKey, saveUserAiKey } from "../aiKeys.js";

const undiciAgent = new Agent({ connect: { family: 4, timeout: 10000 } });

export const aiKeysRouter = Router();

const SaveKey = z.object({
  apiKey: z.string().min(10).max(500),
  provider: z.string().default("google"),
});

const adminOnly = [requireAuth, requireRole("admin", "super_admin")] as const;

async function checkGeminiKey(apiKey: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    dispatcher: undiciAgent,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
      generationConfig: { maxOutputTokens: 4, temperature: 0 },
    }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const message = data?.error?.message || data?.error || "Gemini key check failed";
    const status = r.status === 429 ? "limited" : "invalid";
    return { ok: false, status, httpStatus: r.status, message: String(message) };
  }
  return { ok: true, status: "active", httpStatus: r.status, message: "Gemini key is active", usage: data?.usageMetadata };
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
    res.status(500).json({ error: error.message || "Could not save Gemini API key" });
  }
});

aiKeysRouter.post("/check", ...adminOnly, async (req: AuthedRequest, res) => {
  const rows = await UserAiKey.find({ userId: req.user!.id }).sort({ updatedAt: 1 });
  if (!rows.length) return res.status(404).json({ error: "No Gemini API key saved" });

  const checks = [];
  for (const row of rows) {
    const result = await checkGeminiKey(decryptApiKey(row.encryptedKey));
    row.status = result.status;
    row.lastError = result.ok ? null : result.message;
    await row.save();
    checks.push({ id: String(row._id), keyPreview: row.keyPreview, ...result });
  }
  res.json({ check: checks[0], checks });
});

aiKeysRouter.delete("/", ...adminOnly, async (req: AuthedRequest, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  await UserAiKey.deleteMany({ userId: req.user!.id, ...(id ? { _id: id } : {}) });
  res.json({ ok: true });
});
