import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function databaseUrl(): string {
  const value = req("DATABASE_URL");
  if (!/^mongodb(\+srv)?:\/\//.test(value)) {
    throw new Error("DATABASE_URL must be a mongodb:// or mongodb+srv:// connection string.");
  }
  return value;
}

export const env = {
  DATABASE_URL: databaseUrl(),
  JWT_SECRET: req("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "8080", 10),
  CORS_ORIGIN: (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim()),
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "",
  SUPER_ADMIN_EMAILS: (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
};
