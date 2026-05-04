import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const adminRouter = Router();

adminRouter.get("/stats", requireAuth, requireRole("admin", "super_admin"), async (_req, res) => {
  const [users, courses, topics, pyqs] = await Promise.all([
    prisma.user.count(), prisma.course.count(),
    prisma.topic.count(), prisma.coursePyq.count(),
  ]);
  res.json({ users, courses, topics, pyqs });
});

adminRouter.get("/users", requireAuth, requireRole("super_admin"), async (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ email: { contains: q } }, { displayName: { contains: q } }] } : {},
    include: { roles: true }, orderBy: { createdAt: "desc" }, take: 200,
  });
  res.json({ users });
});

const RoleBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "super_admin"]),
  grant: z.boolean(),
});

adminRouter.post("/roles", requireAuth, requireRole("super_admin"), async (req, res) => {
  const parsed = RoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, role, grant } = parsed.data;
  if (grant) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId, role } },
      update: {}, create: { userId, role },
    });
  } else {
    await prisma.userRole.deleteMany({ where: { userId, role } });
  }
  res.json({ ok: true });
});

adminRouter.delete("/users/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  await prisma.user.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});
