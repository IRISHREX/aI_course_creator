import { Router } from "express";
import { z } from "zod";
import { Course, Topic } from "../models.js";
import { requireAuth, requireRole } from "../auth.js";

export const coursesRouter = Router();

coursesRouter.get("/", async (_req, res) => {
  const courses = await Course.find().sort({ orderIndex: 1 }).lean();
  res.json({ courses });
});

coursesRouter.get("/:slug", async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug }).lean();
  if (!course) return res.status(404).json({ error: "Not found" });
  const topics = await Topic.find({ courseId: course._id }).sort({ unit: 1, orderIndex: 1 }).lean();
  res.json({ course: { ...course, topics } });
});

const UpsertCourse = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  coverEmoji: z.string().optional(),
  orderIndex: z.number().int().optional(),
  sourceText: z.string().optional(),
  generationStatus: z.string().optional(),
  tags: z.array(z.string()).optional(),
  toc: z.any().optional(),
});

function normalizeCourseInput(input: Partial<z.infer<typeof UpsertCourse>>) {
  const data: any = { ...input };
  const description = data.description || "";
  if (description.length > 5000) {
    data.sourceText = data.sourceText || description;
    data.description = description.replace(/\s+/g, " ").trim().slice(0, 500);
  }
  return data;
}

coursesRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertCourse.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const course = await Course.create(normalizeCourseInput(parsed.data));
  res.json({ course });
});

coursesRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertCourse.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const course = await Course.findByIdAndUpdate(
    req.params.id, normalizeCourseInput(parsed.data), { new: true },
  ).lean();
  if (!course) return res.status(404).json({ error: "Not found" });
  res.json({ course });
});

coursesRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await Course.findByIdAndDelete(req.params.id);
  await Topic.deleteMany({ courseId: req.params.id });
  res.json({ ok: true });
});
