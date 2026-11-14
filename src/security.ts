import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { config } from "./config.js";
import { requireDatabase } from "./db.js";

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Header accepted only from trusted Roblox server Scripts. Never expose it to clients. */
export function verifyRobloxToken(headers: Record<string, unknown>): boolean {
  if (!config.FORGE_ROBLOX_TOKEN) return false;
  const supplied = String(headers["x-forge-token"] ?? "");
  return safeEqualText(supplied, config.FORGE_ROBLOX_TOKEN);
}

export async function verifyForgeRequest(headers: Record<string, unknown>, rawBody: string): Promise<void> {
  const timestamp = String(headers["x-forge-timestamp"] ?? "");
  const nonce = String(headers["x-forge-nonce"] ?? "");
  const signature = String(headers["x-forge-signature"] ?? "");
  const keyId = String(headers["x-forge-key-id"] ?? "");
  if (!/^\d{10,13}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw Object.assign(new Error("Cabeçalhos HMAC inválidos"), { statusCode: 401 });
  }
  const millis = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (Math.abs(Date.now() - millis) > 30_000) throw Object.assign(new Error("Timestamp expirado"), { statusCode: 401 });
  const secrets = [
    ...(keyId === config.FORGE_HMAC_KEY_ID && config.FORGE_HMAC_SECRET ? [config.FORGE_HMAC_SECRET] : []),
    ...(keyId === config.FORGE_HMAC_KEY_ID_PREVIOUS && config.FORGE_HMAC_SECRET_PREVIOUS ? [config.FORGE_HMAC_SECRET_PREVIOUS] : [])
  ];
  const payload = `${timestamp}.${nonce}.${rawBody}`;
  const valid = secrets.some(secret => safeEqualHex(createHmac("sha256", secret).update(payload).digest("hex"), signature));
  if (!valid) throw Object.assign(new Error("Assinatura inválida"), { statusCode: 401 });
  const db = requireDatabase();
  const { error } = await db.from("forge_nonces").insert({ nonce, key_id: keyId, expires_at: new Date(Date.now() + 120_000).toISOString() });
  if (error) {
    if (error.code === "23505") throw Object.assign(new Error("Nonce reutilizado"), { statusCode: 409 });
    throw Object.assign(new Error("Não foi possível validar anti-replay"), { statusCode: 503 });
  }
}
export function newIdempotencyFallback(): string { return randomUUID(); }
