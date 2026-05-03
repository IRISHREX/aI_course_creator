import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const pyqRouter = Router();

pyqRouter.get("/", async (req, res) => {
  const courseId = String(req.query.courseId || "");
  const topicId = req.query.topicId ? String(req.query.topicId) : undefined;
  const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
  if (!courseId) return res.status(400).json({ error: "courseId required" });

  const items = await prisma.coursePyq.findMany({
    where: {
      courseId,
      ...(year ? { year } : {}),
      ...(topicId ? { topicLinks: { some: { topicId } } } : {}),
    },
    include: { topicLinks: { include: { topic: { select: { id: true, title: true, slug: true } } } } },
    orderBy: [{ year: "desc" }, { orderIndex: "asc" }],
  });
  res.json({ pyqs: items });
});

const UpsertPyq = z.object({
  courseId: z.string().uuid(),
  question: z.string().min(1),
  answer: z.string().optional(),
  marks: z.number().int().nullable().optional(),
  year: z.number().int().nullable().optional(),
  source: z.string().nullable().optional(),
  topicIds: z.array(z.string().uuid()).optional(),
});

pyqRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertPyq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { topicIds = [], ...data } = parsed.data;
  const pyq = await prisma.coursePyq.create({
    data: {
      ...data,
      topicLinks: { create: topicIds.map(topicId => ({ topicId })) },
    },
  });
  res.json({ pyq });
});

pyqRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertPyq.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { topicIds, ...data } = parsed.data;
  const pyq = await prisma.$transaction(async (tx) => {
    const updated = await tx.coursePyq.update({ where: { id: req.params.id }, data });
    if (topicIds) {
      await tx.pyqTopic.deleteMany({ where: { pyqId: req.params.id } });
      if (topicIds.length)
        await tx.pyqTopic.createMany({
          data: topicIds.map(topicId => ({ pyqId: req.params.id, topicId })),
        });
    }
    return updated;
  });
  res.json({ pyq });
});

pyqRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await prisma.coursePyq.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
