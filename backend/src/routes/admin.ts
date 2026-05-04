import { Router } from "express";
import { z } from "zod";
import { User, UserRole, Course, Topic, CoursePyq } from "../models.js";
import { requireAuth, requireRole } from "../auth.js";

export const adminRouter = Router();

adminRouter.get("/stats", requireAuth, requireRole("admin", "super_admin"), async (_req, res) => {
  const [users, courses, topics, pyqs] = await Promise.all([
    User.countDocuments(), Course.countDocuments(), Topic.countDocuments(), CoursePyq.countDocuments(),
  ]);
  res.json({ users, courses, topics, pyqs });
});

adminRouter.get("/users", requireAuth, requireRole("super_admin"), async (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const filter = q
    ? { $or: [{ email: { $regex: q, $options: "i" } }, { displayName: { $regex: q, $options: "i" } }] }
    : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const roles = await UserRole.find({ userId: { $in: users.map(u => u._id) } }).lean();
  const rolesByUser = new Map<string, any[]>();
  for (const r of roles) {
    const k = String(r.userId);
    if (!rolesByUser.has(k)) rolesByUser.set(k, []);
    rolesByUser.get(k)!.push(r);
  }
  res.json({
    users: users.map(u => ({ ...u, id: String(u._id), roles: rolesByUser.get(String(u._id)) || [] })),
  });
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
    await UserRole.updateOne({ userId, role }, { $setOnInsert: { userId, role } }, { upsert: true });
  } else {
    await UserRole.deleteMany({ userId, role });
  }
  res.json({ ok: true });
});

adminRouter.delete("/users/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  const id = String(req.params.id);
  await Promise.all([
    User.findByIdAndDelete(id),
    UserRole.deleteMany({ userId: id }),
  ]);
  res.json({ ok: true });
});
