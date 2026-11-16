import { createHash, timingSafeEqual } from 'node:crypto';

function digest(valor: string): Buffer {
  return createHash('sha256').update(valor).digest();
}

/** Comparação em tempo constante. Comparar hashes evita vazar o tamanho do token. */
export function tokenValido(header: string | undefined, esperado: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const recebido = header.slice('Bearer '.length);
  return timingSafeEqual(digest(recebido), digest(esperado));
}
