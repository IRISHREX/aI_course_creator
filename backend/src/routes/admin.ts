import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { body, IdParam, params, query } from "../validation.js";

export const adminRouter = Router();

adminRouter.get("/stats", requireAuth, requireRole("admin", "super_admin"), async (_req, res) => {
  const [users, courses, topics, pyqs] = await Promise.all([
    prisma.user.count(), prisma.course.count(),
    prisma.topic.count(), prisma.coursePyq.count(),
  ]);
  res.json({ users, courses, topics, pyqs });
});

adminRouter.get("/users", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { q } = query(z.object({ q: z.string().max(120).optional().default("") }), req);
  const search = q.toLowerCase();
  const users = await prisma.user.findMany({
    where: search ? { OR: [{ email: { contains: search } }, { displayName: { contains: search } }] } : {},
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      roles: { select: { id: true, role: true, createdAt: true, userId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ users });
});

const RoleBody = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "super_admin"]),
  grant: z.boolean(),
});

adminRouter.post("/roles", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { userId, role, grant } = body(RoleBody, req);
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
  const { id } = params(IdParam, req);
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});
