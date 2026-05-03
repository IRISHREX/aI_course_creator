// Thin proxy to Lovable AI Gateway so the browser never sees the API key.
// Mirrors what the existing Supabase edge functions do.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { env } from "../env.js";

export const aiRouter = Router();

const ChatBody = z.object({
  model: z.string().default("google/gemini-2.5-flash"),
  messages: z.array(z.object({ role: z.string(), content: z.any() })),
  tools: z.any().optional(),
  tool_choice: z.any().optional(),
  temperature: z.number().optional(),
});

aiRouter.post("/chat", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  if (!env.LOVABLE_API_KEY) return res.status(500).json({ error: "LOVABLE_API_KEY not configured" });
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.data),
  });
  const text = await r.text();
  res.status(r.status).type("application/json").send(text);
});
