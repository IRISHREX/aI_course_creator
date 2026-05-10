import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { body } from "../validation.js";

export const progressRouter = Router();

progressRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const progress = await prisma.topicProgress.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ progress });
});

const ProgressBody = z.object({
  topicId: z.string().uuid(),
  viewed: z.boolean().optional(),
  passed: z.boolean().optional(),
  attempts: z.number().int().min(0).optional(),
  bestQuizScore: z.number().int().min(0).max(100).optional(),
});

progressRouter.put("/", requireAuth, async (req: AuthedRequest, res) => {
  const { topicId, ...data } = body(ProgressBody, req);
  const progress = await prisma.topicProgress.upsert({
    where: { userId_topicId: { userId: req.user!.id, topicId } },
    update: data,
    create: { userId: req.user!.id, topicId, ...data },
  });
  res.json({ progress });
});
