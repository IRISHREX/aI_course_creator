import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken, requireAuth, AuthedRequest } from "../auth.js";
import { env } from "../env.js";

export const authRouter = Router();

const Creds = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120).optional(),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = Creds.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, displayName } = parsed.data;
  const lower = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: lower,
      passwordHash,
      displayName: displayName || lower.split("@")[0],
      roles: { create: [{ role: "user" }] },
    },
  });

  if (env.SUPER_ADMIN_EMAILS.includes(lower)) {
    await prisma.userRole.createMany({
      data: [{ userId: user.id, role: "admin" }, { userId: user.id, role: "super_admin" }],
      skipDuplicates: true,
    });
  }

  const token = signToken({ sub: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = Creds.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const passwordHash = typeof user.passwordHash === "string" ? user.passwordHash : String(user.passwordHash ?? "");
  const ok = await bcrypt.compare(password, passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken({ sub: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, displayName: true, createdAt: true },
  });
  res.json({ user, roles: req.user!.roles });
});

authRouter.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ displayName: z.string().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { displayName: parsed.data.displayName },
    select: { id: true, email: true, displayName: true, createdAt: true },
  });
  res.json({ user, roles: req.user!.roles });
});
