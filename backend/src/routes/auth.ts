import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User, UserRole } from "../models.js";
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

  if (await User.exists({ email: lower })) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: lower,
    passwordHash,
    displayName: displayName || lower.split("@")[0],
  });
  await UserRole.create({ userId: user._id, role: "user" });

  if (env.SUPER_ADMIN_EMAILS.includes(lower)) {
    for (const role of ["admin", "super_admin"] as const) {
      await UserRole.updateOne({ userId: user._id, role }, { $setOnInsert: { userId: user._id, role } }, { upsert: true });
    }
  }

  const id = String(user._id);
  const token = signToken({ sub: id, email: user.email });
  res.json({ token, user: { id, email: user.email, displayName: user.displayName } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = Creds.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const id = String(user._id);
  const token = signToken({ sub: id, email: user.email });
  res.json({ token, user: { id, email: user.email, displayName: user.displayName } });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.id, "email displayName createdAt").lean();
  res.json({ user: user && { id: String(user._id), email: user.email, displayName: user.displayName, createdAt: user.createdAt }, roles: req.user!.roles });
});

authRouter.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ displayName: z.string().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await User.findByIdAndUpdate(
    req.user!.id, { displayName: parsed.data.displayName },
    { new: true, projection: "email displayName createdAt" },
  ).lean();
  res.json({ user: user && { id: String(user._id), email: user.email, displayName: user.displayName, createdAt: user.createdAt }, roles: req.user!.roles });
});
