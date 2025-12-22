import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const getArg = (name) => {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
};

const daysArg = getArg("--days");
const noteArg = getArg("--note");

const days = daysArg ? Number(daysArg) : null;
if (daysArg && (!Number.isFinite(days) || days <= 0)) {
  console.error("Invalid --days value (must be a positive number).");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const pepper = process.env.SIGNUP_CODE_PEPPER ?? "";
const encryptionKeyRaw = process.env.SIGNUP_CODE_ENCRYPTION_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!pepper) {
  console.error("Missing SIGNUP_CODE_PEPPER.");
  process.exit(1);
}

if (!encryptionKeyRaw) {
  console.error("Missing SIGNUP_CODE_ENCRYPTION_KEY.");
  process.exit(1);
}

const parseKey = (raw) => {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  return Buffer.from(trimmed, "base64");
};

const encryptionKey = parseKey(encryptionKeyRaw);
if (encryptionKey.length !== 32) {
  console.error("SIGNUP_CODE_ENCRYPTION_KEY must be 32 bytes (base64) or 64 hex chars.");
  process.exit(1);
}

const encryptToBase64 = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
};

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateCode = () => {
  const bytes = crypto.randomBytes(6);
  let result = "";
  for (let i = 0; i < 6; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
};

const hashInviteCode = (code) =>
  crypto.createHash("sha256").update(`${pepper}:${code.trim()}`).digest("hex");

const code = generateCode();
const codeHash = hashInviteCode(code);
const codeCiphertext = encryptToBase64(code);
const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error } = await supabase.from("signup_invite_codes").insert({
  code_hash: codeHash,
  code_ciphertext: codeCiphertext,
  note: noteArg ?? null,
  expires_at: expiresAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  max_uses: 1,
});

if (error) {
  console.error("Failed to create invite code:", error.message);
  process.exit(1);
}

console.log("Invite code created.");
console.log("CODE:", code);
if (expiresAt) console.log("EXPIRES_AT:", expiresAt);
if (noteArg) console.log("NOTE:", noteArg);
