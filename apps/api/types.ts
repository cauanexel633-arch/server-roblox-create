import type { GenerateRequest, GenerateResponse } from "../../packages/schemas/src/index.js";
import type { AppConfig, ConfigResult } from "../../packages/shared/src/index.js";
import type { KeyResolver, NonceStore } from "../../packages/security/src/index.js";

/** Cria jobs de geração. Implementação real (Supabase + fila) chega na F1/F2. */
export interface JobGateway {
  createJob(input: { keyId: string; request: GenerateRequest; traceId: string }): Promise<GenerateResponse>;
}

/** Consome um lote limitado da fila. Implementação real chega na F2. */
export interface QueueProcessor {
  processBatch(input: { traceId: string }): Promise<{ processed: number }>;
}

export interface AppDeps {
  configResult: ConfigResult;
  /** Sem NonceStore não há proteção anti-replay: a autenticação falha fechada (503). */
  nonceStore?: NonceStore;
  keyResolver?: KeyResolver;
  jobs?: JobGateway;
  queue?: QueueProcessor;
  /** Relógio injetável (epoch em segundos) para testes. */
  nowSeconds?: () => number;
}

export type { AppConfig };

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
    authKeyId?: string;
  }
}
