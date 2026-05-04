import { Router } from "express";
import { z } from "zod";
import { TopicProgress } from "../models.js";
import { requireAuth, AuthedRequest } from "../auth.js";

export const progressRouter = Router();

progressRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const progress = await TopicProgress.find({ userId: req.user!.id }).sort({ updatedAt: -1 }).lean();
  res.json({ progress });
});

const ProgressBody = z.object({
  topicId: z.string().min(1),
  viewed: z.boolean().optional(),
  passed: z.boolean().optional(),
  attempts: z.number().int().min(0).optional(),
  bestQuizScore: z.number().int().min(0).max(100).optional(),
});

progressRouter.put("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ProgressBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { topicId, ...data } = parsed.data;
  const progress = await TopicProgress.findOneAndUpdate(
    { userId: req.user!.id, topicId },
    { $set: data, $setOnInsert: { userId: req.user!.id, topicId } },
    { upsert: true, new: true },
  ).lean();
  res.json({ progress });
});
