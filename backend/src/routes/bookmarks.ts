import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { body, IdParam, params } from "../validation.js";

export const bookmarksRouter = Router();

bookmarksRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const items = await prisma.bookmark.findMany({
    where: { userId: req.user!.id }, orderBy: { createdAt: "desc" },
  });
  res.json({ bookmarks: items });
});

const Body = z.object({
  topicId: z.string().uuid(),
  courseId: z.string().uuid(),
  pageIndex: z.number().int().min(0).default(0),
  wordIndex: z.number().int().min(0).default(0),
  label: z.string().max(200).optional(),
});

bookmarksRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = body(Body, req);
  const bookmark = await prisma.bookmark.create({
    data: { ...parsed, userId: req.user!.id } as any,
  });
  res.json({ bookmark });
});

bookmarksRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = params(IdParam, req);
  await prisma.bookmark.deleteMany({ where: { id, userId: req.user!.id } });
  res.json({ ok: true });
});
