import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const coursesRouter = Router();

coursesRouter.get("/", async (_req, res) => {
  const courses = await prisma.course.findMany({ orderBy: { orderIndex: "asc" } });
  res.json({ courses });
});

coursesRouter.get("/:slug", async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { slug: req.params.slug },
    include: { topics: { orderBy: [{ unit: "asc" }, { orderIndex: "asc" }] } },
  });
  if (!course) return res.status(404).json({ error: "Not found" });
  res.json({ course });
});

const UpsertCourse = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  coverEmoji: z.string().optional(),
  orderIndex: z.number().int().optional(),
  sourceText: z.string().optional(),
  tags: z.array(z.string()).optional(),
  toc: z.any().optional(),
});

coursesRouter.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertCourse.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const course = await prisma.course.create({ data: parsed.data });
  res.json({ course });
});

coursesRouter.patch("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const parsed = UpsertCourse.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const course = await prisma.course.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ course });
});

coursesRouter.delete("/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  await prisma.course.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
