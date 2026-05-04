import { Router } from "express";
import { z } from "zod";
import { Bookmark } from "../models.js";
import { requireAuth, AuthedRequest } from "../auth.js";

export const bookmarksRouter = Router();

bookmarksRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const items = await Bookmark.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
  res.json({ bookmarks: items });
});

const Body = z.object({
  topicId: z.string().min(1),
  courseId: z.string().min(1),
  pageIndex: z.number().int().min(0).default(0),
  wordIndex: z.number().int().min(0).default(0),
  label: z.string().max(200).optional(),
});

bookmarksRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const bookmark = await Bookmark.create({ ...parsed.data, userId: req.user!.id });
  res.json({ bookmark });
});

bookmarksRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await Bookmark.deleteOne({ _id: req.params.id, userId: req.user!.id });
  res.json({ ok: true });
});
