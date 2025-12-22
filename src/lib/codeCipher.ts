import crypto from "node:crypto";

const getKey = () => {
  const raw = process.env.SIGNUP_CODE_ENCRYPTION_KEY ?? "";
  if (!raw) {
    throw new Error("Missing SIGNUP_CODE_ENCRYPTION_KEY (server-only).");
  }

  const trimmed = raw.trim();
  const asHex = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : null;
  if (asHex && asHex.length === 32) return asHex;

  const asBase64 = Buffer.from(trimmed, "base64");
  if (asBase64.length === 32) return asBase64;

  throw new Error("SIGNUP_CODE_ENCRYPTION_KEY must be 32 bytes (base64) or 64 hex chars.");
};

export const encryptToBase64 = (plaintext: string) => {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
};

export const decryptFromBase64 = (payload: string) => {
  const key = getKey();
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 12 + 16 + 1) {
    throw new Error("Invalid ciphertext payload.");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
};

