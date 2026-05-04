import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { CoursePyq, Topic } from "../models.js";
import { requireAuth, requireRole } from "../auth.js";

export const pyqRouter = Router();

function toObjectId(value: string) {
  return new Types.ObjectId(value);
}

async function attachTopics(pyqs: any[]) {
  const topicIds = Array.from(new Set(pyqs.flatMap(p => (p.topicIds || []).map(String))));
  if (!topicIds.length) return pyqs.map(p => ({ ...p, topics: [] }));
  const topics = await Topic.find({ _id: { $in: topicIds } }, "title slug").lean();
  const byId = new Map(topics.map(t => [String(t._id), t]));
  return pyqs.map(p => ({
    ...p,
    topics: (p.topicIds || []).map((id: any) => byId.get(String(id))).filter(Boolean),
  }));
}

pyqRouter.get("/", async (req, res) => {
  const courseId = String(req.query.courseId || "");
  if (!courseId) return res.status(400).json({ error: "courseId required" });
  const topicId = req.query.topicId ? String(req.query.topicId) : undefined;
  const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;

  const filter: any = { courseId };
  if (year) filter.year = year;
  if (topicId) filter.topicIds = topicId;

  const items = await CoursePyq.find(filter).sort({ year: -1, orderIndex: 1 }).lean();
  res.json({ pyqs: await attachTopics(items) });
});

const UpsertPyq = z.object({
  courseId: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().default(""),
  marks: z.number().int().nullable().optional(),
  year: z.number().int().nullable().optional(),
  source: z.string().nullable().optional(),
  topicIds: z.array(z.string().min(1)).optional(),
});

pyqRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertPyq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { topicIds = [], ...data } = parsed.data;
  const pyq = await CoursePyq.create({ ...data, topicIds: topicIds.map(toObjectId) });
  res.json({ pyq });
});

pyqRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertPyq.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { topicIds, ...data } = parsed.data;
  const update: any = { ...data };
  if (topicIds) update.topicIds = topicIds.map(toObjectId);
  const pyq = await CoursePyq.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
  res.json({ pyq });
});

pyqRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await CoursePyq.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

pyqRouter.post("/:id/topics", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = z.object({ topicId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await CoursePyq.updateOne({ _id: req.params.id }, { $addToSet: { topicIds: toObjectId(parsed.data.topicId) } });
  res.json({ ok: true });
});

pyqRouter.delete("/:id/topics/:topicId", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await CoursePyq.updateOne({ _id: req.params.id }, { $pull: { topicIds: toObjectId(req.params.topicId) } });
  res.json({ ok: true });
});
