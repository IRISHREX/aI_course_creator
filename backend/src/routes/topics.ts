import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";
import { IdParam, params, query } from "../validation.js";
import { HttpError } from "../http.js";

export const topicsRouter = Router();

topicsRouter.get("/", async (req, res) => {
  const { courseId } = query(z.object({ courseId: z.string().uuid().optional() }), req);
  const topics = await prisma.topic.findMany({
    where: courseId ? { courseId } : {},
    orderBy: [{ unit: "asc" }, { orderIndex: "asc" }],
  });
  res.json({ topics });
});

topicsRouter.get("/by-slug/:slug", async (req, res) => {
  const { slug } = params(z.object({ slug: z.string().min(1).max(220) }), req);
  const topic = await prisma.topic.findUnique({ where: { slug } });
  if (!topic) throw new HttpError(404, "Topic not found", "TOPIC_NOT_FOUND");
  res.json({ topic });
});

topicsRouter.get("/:id", async (req, res) => {
  const { id } = params(IdParam, req);
  const topic = await prisma.topic.findUnique({ where: { id } });
  if (!topic) throw new HttpError(404, "Topic not found", "TOPIC_NOT_FOUND");
  res.json({ topic });
});

const UpsertTopic = z.object({
  courseId: z.string().uuid(),
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

function normalizeTopicInput(input: any) {
  if (!input || typeof input !== "object") return input;
  return {
    ...input,
    courseId: input.courseId ?? input.course_id,
    orderIndex: input.orderIndex ?? input.order_index,
    generationStatus: input.generationStatus ?? input.generation_status,
  };
}

topicsRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  if (Array.isArray(req.body)) {
    const parsed = req.body.map((item) => UpsertTopic.parse(normalizeTopicInput(item)));
    const topics = await prisma.$transaction(parsed.map((item) => prisma.topic.create({ data: item as any })));
    return res.json({ topics });
  }

  const parsed = UpsertTopic.parse(normalizeTopicInput(req.body));
  const topic = await prisma.topic.create({ data: parsed as any });
  res.json({ topic });
});

topicsRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthedRequest, res) => {
  const { id } = params(IdParam, req);
  const parsed = UpsertTopic.partial().parse(normalizeTopicInput(req.body));
  const note = (req.body?.versionNote as string) || null;

  const result = await prisma.$transaction(async (tx) => {
    const topicId = id;
    const before = await tx.topic.findUnique({ where: { id: topicId } });
    if (!before) throw new HttpError(404, "Topic not found", "TOPIC_NOT_FOUND");
    const topic = await tx.topic.update({ where: { id: topicId }, data: parsed as any });
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
  const { id } = params(IdParam, req);
  await prisma.topic.delete({ where: { id } });
  res.json({ ok: true });
});

topicsRouter.get("/:id/versions", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id } = params(IdParam, req);
  const versions = await prisma.topicVersion.findMany({
    where: { topicId: id }, orderBy: { createdAt: "desc" },
  });
  res.json({ versions });
});

topicsRouter.post("/:id/revert/:versionId", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id: topicId, versionId } = params(z.object({ id: z.string().uuid(), versionId: z.string().uuid() }), req);
  const v = await prisma.topicVersion.findUnique({ where: { id: versionId } });
  if (!v || v.topicId !== topicId) throw new HttpError(404, "Version not found", "VERSION_NOT_FOUND");
  const topic = await prisma.topic.update({
    where: { id: topicId },
    data: {
      title: v.title, summary: v.summary, content: v.content as any,
      quiz: v.quiz as any, mindmap: v.mindmap as any, visualization: v.visualization,
    },
  });
  res.json({ topic });
});
