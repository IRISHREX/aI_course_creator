import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { coursesRouter } from "./routes/courses.js";
import { topicsRouter } from "./routes/topics.js";
import { bookmarksRouter } from "./routes/bookmarks.js";
import { pyqRouter } from "./routes/pyq.js";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || env.CORS_ORIGIN.includes("*") || env.CORS_ORIGIN.includes(origin)) cb(null, true);
    else cb(new Error("CORS not allowed"));
  },
  credentials: true,
}));
app.use(pinoHttp());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/courses", coursesRouter);
app.use("/topics", topicsRouter);
app.use("/bookmarks", bookmarksRouter);
app.use("/pyq", pyqRouter);
app.use("/admin", adminRouter);
app.use("/ai", aiRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
