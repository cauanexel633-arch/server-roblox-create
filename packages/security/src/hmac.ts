import { createHmac, timingSafeEqual } from "node:crypto";

export const HEADER_TIMESTAMP = "x-forge-timestamp";
export const HEADER_NONCE = "x-forge-nonce";
export const HEADER_SIGNATURE = "x-forge-signature";
export const HEADER_KEY_ID = "x-forge-key-id";

/** Tolerância de relógio entre o servidor do jogo e a API (seção 5.3). */
export const TIMESTAMP_TOLERANCE_SECONDS = 30;
/** O nonce precisa ser lembrado ao menos pelo dobro da janela de tolerância. */
export const NONCE_TTL_SECONDS = TIMESTAMP_TOLERANCE_SECONDS * 2 + 5;

/** HMAC-SHA256(secret, timestamp + "." + nonce + "." + rawBody), em hexadecimal. */
export function computeSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: Buffer | string,
): string {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(nonce)
    .update(".")
    .update(rawBody)
    .digest("hex");
}

/** Comparação em tempo constante de duas assinaturas hexadecimais. */
export function signaturesMatch(expectedHex: string, receivedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(receivedHex)) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(receivedHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ResolvedKey {
  keyId: string;
  /** Segredo atual primeiro; segredos anteriores aceitos durante a rotação. */
  secrets: readonly string[];
}

export interface KeyResolver {
  resolve(keyId: string): Promise<ResolvedKey | null>;
}

export interface NonceStore {
  /**
   * Registra o nonce de forma atômica. Retorna true se ele era inédito;
   * false se já foi visto (replay).
   */
  claim(keyId: string, nonce: string, ttlSeconds: number): Promise<boolean>;
}

export type HmacFailure =
  | "missing_headers"
  | "bad_timestamp"
  | "timestamp_out_of_window"
  | "bad_nonce"
  | "unknown_key"
  | "bad_signature"
  | "replay";

export type HmacResult =
  | { ok: true; keyId: string }
  | { ok: false; reason: HmacFailure };

export interface VerifyInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  /** Epoch em segundos; injetável para testes. */
  nowSeconds: number;
  keys: KeyResolver;
  nonces: NonceStore;
}

function header(
  headers: VerifyInput["headers"],
  name: string,
): string | undefined {
  const v = headers[name];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Valida uma requisição assinada. A ordem é deliberada: o nonce só é
 * consumido DEPOIS de a assinatura ser válida, para que requisições não
 * autenticadas não possam encher o armazenamento de nonces.
 */
export async function verifyHmacRequest(input: VerifyInput): Promise<HmacResult> {
  const timestamp = header(input.headers, HEADER_TIMESTAMP);
  const nonce = header(input.headers, HEADER_NONCE);
  const signature = header(input.headers, HEADER_SIGNATURE);
  const keyId = header(input.headers, HEADER_KEY_ID);
  if (!timestamp || !nonce || !signature || !keyId) {
    return { ok: false, reason: "missing_headers" };
  }

  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(input.nowSeconds - Number(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return { ok: false, reason: "bad_nonce" };

  const key = await input.keys.resolve(keyId);
  if (!key) return { ok: false, reason: "unknown_key" };

  // Sem curto-circuito: todos os segredos são testados para manter o tempo estável.
  let valid = false;
  for (const secret of key.secrets) {
    const expected = computeSignature(secret, timestamp, nonce, input.rawBody);
    if (signaturesMatch(expected, signature)) valid = true;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  const fresh = await input.nonces.claim(key.keyId, nonce, NONCE_TTL_SECONDS);
  if (!fresh) return { ok: false, reason: "replay" };

  return { ok: true, keyId: key.keyId };
}

/** Resolve a chave configurada por variáveis de ambiente, com suporte a rotação. */
export class EnvKeyResolver implements KeyResolver {
  private readonly keyId: string;
  private readonly secrets: readonly string[];

  constructor(keyId: string, current: string, previous?: string) {
    this.keyId = keyId;
    this.secrets = previous ? [current, previous] : [current];
  }

  async resolve(keyId: string): Promise<ResolvedKey | null> {
    return keyId === this.keyId ? { keyId: this.keyId, secrets: this.secrets } : null;
  }
}
