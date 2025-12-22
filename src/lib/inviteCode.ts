import crypto from "node:crypto";

export const hashInviteCode = (code: string) => {
  const pepper = process.env.SIGNUP_CODE_PEPPER ?? "";
  if (!pepper) {
    throw new Error("Missing SIGNUP_CODE_PEPPER (server-only).");
  }
  const normalized = code.trim();
  return crypto.createHash("sha256").update(`${pepper}:${normalized}`).digest("hex");
};

