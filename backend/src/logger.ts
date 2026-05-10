import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.apiKey",
      "req.body.token",
      "req.body.encryptedKey",
      "res.headers.set-cookie",
      "*.password",
      "*.apiKey",
      "*.encryptedKey",
      "*.authorization",
    ],
    censor: "[redacted]",
  },
});
