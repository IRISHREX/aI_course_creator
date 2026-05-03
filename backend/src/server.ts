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
import { aiKeysRouter } from "./routes/aiKeys.js";
import { progressRouter } from "./routes/progress.js";
import { prisma } from "./db.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

function isAllowedOrigin(origin: string) {
  if (env.CORS_ORIGIN.includes("*") || env.CORS_ORIGIN.includes(origin)) return true;
  if (env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      return ["localhost", "127.0.0.1"].includes(url.hostname)
        || url.hostname.startsWith("192.168.")
        || url.hostname.startsWith("10.")
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname);
    } catch {
      return false;
    }
  }
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || isAllowedOrigin(origin)) cb(null, true);
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
app.use("/ai-keys", aiKeysRouter);
app.use("/progress", progressRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

async function start() {
  try {
    await prisma.$connect();
    console.log("DB connected");

    app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
  } catch (err) {
    console.error("DB connection failed", err);
    process.exit(1);
  }
}

start();
