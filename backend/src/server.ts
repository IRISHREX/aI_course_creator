import "express-async-errors";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
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
import { errorHandler, notFound } from "./http.js";
import { logger } from "./logger.js";
import { openApiDocument, swaggerHtml } from "./openapi.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

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
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const requestId = Array.isArray(existing) ? existing[0] : existing || randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
}));

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, db: "ok" });
});
app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
app.get("/docs", (_req, res) => res.type("html").send(swaggerHtml));

app.use("/auth", authRouter);
app.use("/courses", coursesRouter);
app.use("/topics", topicsRouter);
app.use("/bookmarks", bookmarksRouter);
app.use("/pyq", pyqRouter);
app.use("/admin", adminRouter);
app.use("/ai", aiRouter);
app.use("/ai-keys", aiKeysRouter);
app.use("/progress", progressRouter);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await prisma.$connect();
    logger.info("DB connected");

    const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "API listening"));

    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutting down API");
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (err) {
    logger.error({ err }, "DB connection failed");
    process.exit(1);
  }
}

start();
