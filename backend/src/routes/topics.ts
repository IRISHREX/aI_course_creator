import { Router } from "express";
import { z } from "zod";
import { Topic, TopicVersion } from "../models.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";

export const topicsRouter = Router();

topicsRouter.get("/", async (req, res) => {
  const filter = req.query.courseId ? { courseId: String(req.query.courseId) } : {};
  const topics = await Topic.find(filter).sort({ unit: 1, orderIndex: 1 }).lean();
  res.json({ topics });
});

topicsRouter.get("/by-slug/:slug", async (req, res) => {
  const topic = await Topic.findOne({ slug: req.params.slug }).lean();
  if (!topic) return res.status(404).json({ error: "Not found" });
  res.json({ topic });
});

topicsRouter.get("/:id", async (req, res) => {
  const topic = await Topic.findById(req.params.id).lean();
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
  const topic = await Topic.create(parsed.data);
  res.json({ topic });
});

topicsRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthedRequest, res) => {
  const parsed = UpsertTopic.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const note = (req.body?.versionNote as string) || null;

  const before = await Topic.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ error: "Not found" });

  await TopicVersion.create({
    topicId: before._id,
    title: before.title, summary: before.summary,
    content: before.content, quiz: before.quiz,
    mindmap: before.mindmap, visualization: before.visualization,
    note, createdBy: req.user!.id,
  });
  const topic = await Topic.findByIdAndUpdate(req.params.id, parsed.data, { new: true }).lean();
  res.json({ topic });
});

topicsRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await Topic.findByIdAndDelete(req.params.id);
  await TopicVersion.deleteMany({ topicId: req.params.id });
  res.json({ ok: true });
});

topicsRouter.get("/:id/versions", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const versions = await TopicVersion.find({ topicId: req.params.id }).sort({ createdAt: -1 }).lean();
  res.json({ versions });
});

topicsRouter.post("/:id/revert/:versionId", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const v = await TopicVersion.findById(req.params.versionId).lean();
  if (!v || String(v.topicId) !== String(req.params.id)) return res.status(404).json({ error: "Version not found" });
  const topic = await Topic.findByIdAndUpdate(req.params.id, {
    title: v.title, summary: v.summary, content: v.content,
    quiz: v.quiz, mindmap: v.mindmap, visualization: v.visualization,
  }, { new: true }).lean();
  res.json({ topic });
});
