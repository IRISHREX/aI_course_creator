import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { body, IdParam, params, SlugParam } from "../validation.js";
import { HttpError } from "../http.js";

export const coursesRouter = Router();

coursesRouter.get("/", async (_req, res) => {
  const courses = await prisma.course.findMany({ orderBy: { orderIndex: "asc" } });
  res.json({ courses });
});

coursesRouter.get("/:slug", async (req, res) => {
  const { slug } = params(SlugParam, req);
  const course = await prisma.course.findUnique({
    where: { slug },
    include: { topics: { orderBy: [{ unit: "asc" }, { orderIndex: "asc" }] } },
  });
  if (!course) throw new HttpError(404, "Course not found", "COURSE_NOT_FOUND");
  res.json({ course });
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

function normalizeCourseInput(input: z.infer<typeof UpsertCourse>) {
  const data = { ...input };
  const description = data.description || "";

  if (description.length > 5000) {
    data.sourceText = data.sourceText || description;
    data.description = description.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  return data;
}

coursesRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = body(UpsertCourse, req);
  const course = await prisma.course.create({ data: normalizeCourseInput(parsed) as any });
  res.json({ course });
});

coursesRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id } = params(IdParam, req);
  const parsed = body(UpsertCourse.partial(), req);
  const course = await prisma.course.update({ where: { id }, data: normalizeCourseInput(parsed as z.infer<typeof UpsertCourse>) as any });
  res.json({ course });
});

coursesRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { id } = params(IdParam, req);
  await prisma.course.delete({ where: { id } });
  res.json({ ok: true });
});
