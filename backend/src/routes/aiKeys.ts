import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";
import { decryptApiKey, saveUserAiKey } from "../aiKeys.js";

export const aiKeysRouter = Router();

const SaveKey = z.object({
  apiKey: z.string().min(10).max(500),
  provider: z.string().default("google"),
});

const adminOnly = [requireAuth, requireRole("admin", "super_admin")] as const;

async function checkGeminiKey(apiKey: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
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
  return {
    ok: true,
    status: "active",
    httpStatus: r.status,
    message: "Gemini key is active",
    usage: data?.usageMetadata,
  };
}

aiKeysRouter.get("/", ...adminOnly, async (req: AuthedRequest, res) => {
  const keys = await prisma.userAiKey.findMany({
    where: { userId: req.user!.id },
    orderBy: [{ status: "asc" }, { updatedAt: "asc" }],
    select: { id: true, provider: true, keyPreview: true, status: true, lastError: true, updatedAt: true },
  });
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
  const keys = await prisma.userAiKey.findMany({
    where: { userId: req.user!.id },
    orderBy: [{ updatedAt: "asc" }],
  });
  if (!keys.length) return res.status(404).json({ error: "No Gemini API key saved" });

  const checks = [];
  for (const key of keys) {
    const result = await checkGeminiKey(decryptApiKey(key.encryptedKey));
    await prisma.userAiKey.update({
      where: { id: key.id },
      data: {
        status: result.status,
        lastError: result.ok ? null : result.message,
      },
    });
    checks.push({ id: key.id, keyPreview: key.keyPreview, ...result });
  }
  res.json({ check: checks[0], checks });
});

aiKeysRouter.delete("/", ...adminOnly, async (req: AuthedRequest, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  await prisma.userAiKey.deleteMany({ where: { userId: req.user!.id, ...(id ? { id } : {}) } });
  res.json({ ok: true });
});
