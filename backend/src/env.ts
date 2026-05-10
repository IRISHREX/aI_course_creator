import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function int(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function databaseUrl(): string {
  const value = req("DATABASE_URL");

  try {
    const url = new URL(value);
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);

    if (url.protocol === "mysql:" && username === "user" && password === "pass") {
      throw new Error(
        "DATABASE_URL still uses the example MySQL credentials. Update backend/.env with a real MySQL user/password, then restart the API."
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("DATABASE_URL still uses")) {
      throw err;
    }
    throw new Error("DATABASE_URL must be a valid database connection URL.");
  }

  return value;
}

export const env = {
  DATABASE_URL: databaseUrl(),
  JWT_SECRET: req("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: int("PORT", 8080),
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT || "10mb",
  CORS_ORIGIN: (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim()),
  LOVABLE_API_KEY: process.env.LOVABLE_API_KEY || "",
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "",
  SUPER_ADMIN_EMAILS: (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
};
