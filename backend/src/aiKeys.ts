import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { UserAiKey } from "./models.js";
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
  const rows = await UserAiKey.find({ userId, status: "active" }).sort({ updatedAt: 1 }).lean();
  return rows.map((row) => ({
    id: String(row._id),
    provider: row.provider,
    keyPreview: row.keyPreview ?? null,
    apiKey: decryptApiKey(row.encryptedKey),
  }));
}

export async function saveUserAiKey(userId: string, apiKey: string, provider = "google") {
  const trimmed = apiKey.trim();
  const keyPreview = trimmed.length > 8 ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}` : "saved";
  const created = await UserAiKey.create({
    userId, provider,
    encryptedKey: encryptApiKey(trimmed),
    keyPreview, status: "active", lastError: null,
  });
  return {
    id: String(created._id),
    provider: created.provider,
    keyPreview: created.keyPreview,
    status: created.status,
    lastError: created.lastError,
    updatedAt: created.updatedAt,
  };
}

export async function markUserAiKeyLimited(keyId: string, message: string) {
  await UserAiKey.findByIdAndUpdate(keyId, { status: "limited", lastError: message });
}
