import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";

export const topicsRouter = Router();

topicsRouter.get("/", async (req, res) => {
  const courseId = req.query.courseId ? String(req.query.courseId) : undefined;
  const topics = await prisma.topic.findMany({
    where: courseId ? { courseId } : {},
    orderBy: [{ unit: "asc" }, { orderIndex: "asc" }],
  });
  res.json({ topics });
});

topicsRouter.get("/by-slug/:slug", async (req, res) => {
  const topic = await prisma.topic.findUnique({ where: { slug: String(req.params.slug) } });
  if (!topic) return res.status(404).json({ error: "Not found" });
  res.json({ topic });
});

topicsRouter.get("/:id", async (req, res) => {
  const topic = await prisma.topic.findUnique({ where: { id: String(req.params.id) } });
  if (!topic) return res.status(404).json({ error: "Not found" });
  res.json({ topic });
});

const UpsertTopic = z.object({
  courseId: z.string().min(1),
  slug: z.string().min(1),
  unit: z.number().int().min(1),
  orderIndex: z.number().int(),
  title: z.string().min(1),
  summary: z.string().default(""),
  content: z.any().optional(),
  quiz: z.any().optional(),
  mindmap: z.any().optional(),
  visualization: z.string().nullable().optional(),
  generationStatus: z.string().optional(),
});

topicsRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertTopic.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const topic = await prisma.topic.create({ data: parsed.data as any });
  res.json({ topic });
});

topicsRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthedRequest, res) => {
  const parsed = UpsertTopic.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const note = (req.body?.versionNote as string) || null;

  const result = await prisma.$transaction(async (tx) => {
    const topicId = String(req.params.id);
    const before = await tx.topic.findUnique({ where: { id: topicId } });
    if (!before) throw new Error("Not found");
    const topic = await tx.topic.update({ where: { id: topicId }, data: parsed.data as any });
    await tx.topicVersion.create({
      data: {
        topicId: before.id, title: before.title, summary: before.summary,
        content: before.content as any, quiz: before.quiz as any,
        mindmap: before.mindmap as any, visualization: before.visualization,
        note, createdBy: req.user!.id,
      },
    });
    return topic;
  });
  res.json({ topic: result });
});

topicsRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await prisma.topic.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});

topicsRouter.get("/:id/versions", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const versions = await prisma.topicVersion.findMany({
    where: { topicId: String(req.params.id) }, orderBy: { createdAt: "desc" },
  });
  res.json({ versions });
});

topicsRouter.post("/:id/revert/:versionId", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const topicId = String(req.params.id);
  const v = await prisma.topicVersion.findUnique({ where: { id: String(req.params.versionId) } });
  if (!v || v.topicId !== topicId) return res.status(404).json({ error: "Version not found" });
  const topic = await prisma.topic.update({
    where: { id: topicId },
    data: {
      title: v.title, summary: v.summary, content: v.content as any,
      quiz: v.quiz as any, mindmap: v.mindmap as any, visualization: v.visualization,
    },
  });
  res.json({ topic });
});
