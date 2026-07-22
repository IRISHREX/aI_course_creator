import { Router } from "express";
import multer from "multer";
import { Upload } from "../models.js";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";

export const uploadsRouter = Router();

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

uploadsRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "super_admin"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported image type" });
    }

    const doc = await Upload.create({
      contentType: file.mimetype,
      data: file.buffer,
      filename: file.originalname || null,
      createdBy: req.user!.id,
    });

    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] || req.protocol;
    const url = `${proto}://${req.get("host")}/uploads/${doc._id}`;
    res.json({ id: String(doc._id), url });
  },
);

uploadsRouter.get("/:id", async (req, res) => {
  const doc = await Upload.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(doc.data as unknown as Buffer));
});
