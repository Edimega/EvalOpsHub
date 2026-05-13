import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
};

export const verifyPassword = async (password: string, storedHash: string) => {
  const [algorithm, salt, key] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
};

export const createOpaqueToken = (prefix = "eoh") => `${prefix}_${randomBytes(32).toString("base64url")}`;

const encryptionKey = () => {
  const secret = process.env.SECRET_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SECRET_ENCRYPTION_KEY or SESSION_SECRET with at least 32 characters is required");
  }

  return createHash("sha256").update(secret).digest();
};

export const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
};

export const decryptSecret = (value: string) => {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Encrypted secret payload is invalid");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
};
