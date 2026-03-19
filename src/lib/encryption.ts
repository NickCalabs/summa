import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;

  if (envKey !== undefined && envKey !== "") {
    if (!HEX_64_RE.test(envKey)) {
      throw new Error(
        "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
          "Generate one with: openssl rand -hex 32"
      );
    }
    return Buffer.from(envKey, "hex");
  }

  // ENCRYPTION_KEY not set — fall back to BETTER_AUTH_SECRET
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error(
      "ENCRYPTION_KEY must be set in production. " +
        "Generate one with: openssl rand -hex 32"
    );
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY or BETTER_AUTH_SECRET must be set for encryption"
    );
  }

  console.warn(
    "[encryption] WARN: ENCRYPTION_KEY is not set. " +
      "Deriving key from BETTER_AUTH_SECRET — this is unsafe for production. " +
      "Set ENCRYPTION_KEY to a 64-character hex string (openssl rand -hex 32)."
  );

  // Derive a 32-byte key from the auth secret using HMAC-SHA256
  return createHmac("sha256", "summa-encryption-key").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
