import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "./db.js";
import { env } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const KEY = createHash("sha256").update(env.JWT_SECRET).digest();

export function encryptApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptApiKey(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Stored AI key is invalid");
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export type DecryptedAiKey = {
  id: string;
  provider: string;
  keyPreview: string | null;
  apiKey: string;
};

export async function getUserAiKeys(userId: string): Promise<DecryptedAiKey[]> {
  const rows = await prisma.userAiKey.findMany({
    where: { userId, status: "active" },
    orderBy: [{ updatedAt: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    keyPreview: row.keyPreview,
    apiKey: decryptApiKey(row.encryptedKey),
  }));
}

async function ensureMultipleAiKeysAllowed() {
  await prisma.$executeRawUnsafe(
    "CREATE INDEX `user_ai_keys_user_id_status_updated_at_idx` ON `user_ai_keys` (`user_id`, `status`, `updated_at`)",
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe("DROP INDEX `user_ai_keys_user_id_key` ON `user_ai_keys`").catch(() => undefined);
}

function isOldSingleKeyConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002" &&
    JSON.stringify((error as { meta?: unknown }).meta || {}).includes("user_ai_keys_user_id_key")
  );
}

export async function saveUserAiKey(userId: string, apiKey: string, provider = "google") {
  const trimmed = apiKey.trim();
  const keyPreview = trimmed.length > 8 ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}` : "saved";
  const data = {
    userId,
    provider,
    encryptedKey: encryptApiKey(trimmed),
    keyPreview,
    status: "active",
    lastError: null,
  };
  const select = { id: true, provider: true, keyPreview: true, status: true, lastError: true, updatedAt: true };
  try {
    return await prisma.userAiKey.create({ data, select });
  } catch (error) {
    if (!isOldSingleKeyConstraintError(error)) throw error;
    await ensureMultipleAiKeysAllowed();
    return prisma.userAiKey.create({ data, select });
  }
}

export async function markUserAiKeyLimited(keyId: string, message: string) {
  await prisma.userAiKey.update({
    where: { id: keyId },
    data: { status: "limited", lastError: message },
  });
}
