import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { body, IdParam, params, query } from "../validation.js";
import { HttpError } from "../http.js";

export const pyqRouter = Router();

pyqRouter.get("/", async (req, res) => {
  const { courseId, topicId, year } = query(z.object({
    courseId: z.string().uuid(),
    topicId: z.string().uuid().optional(),
    year: z.coerce.number().int().optional(),
  }), req);

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

pyqRouter.get("/topics", async (req, res) => {
  const { courseId } = query(z.object({ courseId: z.string().uuid().optional() }), req);
  const links = await prisma.pyqTopic.findMany({
    where: courseId ? { pyq: { courseId } } : {},
    include: { pyq: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ links });
});

const UpsertPyq = z.object({
  courseId: z.string().uuid(),
  question: z.string().min(1),
  answer: z.string().default(""),
  marks: z.number().int().nullable().optional(),
  year: z.number().int().nullable().optional(),
  source: z.string().nullable().optional(),
  topicIds: z.array(z.string().uuid()).optional(),
});

pyqRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { topicIds = [], ...data } = body(UpsertPyq, req);
  const pyq = await prisma.coursePyq.create({
    data: {
      ...(data as any),
      topicLinks: { create: topicIds.map(topicId => ({ topicId })) },
    } as any,
  });
  res.json({ pyq });
});

pyqRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id } = params(IdParam, req);
  const { topicIds, ...data } = body(UpsertPyq.partial(), req);
  const pyq = await prisma.$transaction(async (tx) => {
    const pyqId = id;
    const updated = await tx.coursePyq.update({ where: { id: pyqId }, data: data as any });
    if (topicIds) {
      await tx.pyqTopic.deleteMany({ where: { pyqId } });
      if (topicIds.length)
        await tx.pyqTopic.createMany({
          data: topicIds.map(topicId => ({ pyqId, topicId })),
        });
    }
    return updated;
  });
  res.json({ pyq });
});

pyqRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id } = params(IdParam, req);
  await prisma.coursePyq.delete({ where: { id } });
  res.json({ ok: true });
});

pyqRouter.post("/:id/topics", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id } = params(IdParam, req);
  const parsed = body(z.object({ topicId: z.string().uuid() }), req);
  const exists = await prisma.coursePyq.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new HttpError(404, "PYQ not found", "PYQ_NOT_FOUND");
  const link = await prisma.pyqTopic.upsert({
    where: { pyqId_topicId: { pyqId: id, topicId: parsed.topicId } },
    update: {},
    create: { pyqId: id, topicId: parsed.topicId },
  });
  res.json({ link });
});

pyqRouter.delete("/:id/topics/:topicId", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id, topicId } = params(z.object({ id: z.string().uuid(), topicId: z.string().uuid() }), req);
  await prisma.pyqTopic.deleteMany({ where: { pyqId: id, topicId } });
  res.json({ ok: true });
});
