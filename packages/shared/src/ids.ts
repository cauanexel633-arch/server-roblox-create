import { randomBytes } from "node:crypto";

// Alfabeto Crockford base32 usado pelo ULID (sem I, L, O, U).
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Gera um ULID (48 bits de tempo + 80 bits aleatórios), ordenável
 * lexicograficamente. Usado para job_id e trace_id.
 */
export function ulid(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now >= 2 ** 48) {
    throw new RangeError("timestamp fora do intervalo ULID");
  }

  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ENCODING.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }

  const bytes = randomBytes(16);
  let random = "";
  for (let i = 0; i < 16; i++) {
    random += ENCODING.charAt((bytes[i] ?? 0) % 32);
  }

  return time + random;
}

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
