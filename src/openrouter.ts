import { OpenAI } from "openai";
import { config, hasOpenRouter } from "./config.js";

type Model = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  endpoints?: string[];
  supported_parameters?: string[];
};

let catalogCache: { at: number; models: Model[] } | undefined;
let modelCursor = 0;
let credentialValidatedAt = 0;
let loggedOpenRouterTransport = false;

// Keep enough execution time for geometry export, storage and Roblox publication.
const AGENT_BUDGET_MS = 20_000;
const CATALOG_TIMEOUT_MS = 5_000;
const MODEL_TIMEOUT_MS = 4_500;
const MAX_MODEL_ATTEMPTS = 4;
const CHAT_COMPLETIONS_ENDPOINT = "/api/v1/chat/completions";

function isTextCapable(model: Model): boolean {
  const outputs = model.architecture?.output_modalities;
  if (Array.isArray(outputs)) return outputs.includes("text");
  const modality = model.architecture?.modality?.toLowerCase() ?? "";
  return modality.endsWith("->text") || modality === "text";
}

function supportsChatCompletions(model: Model): boolean {
  // The catalog request is filtered by endpoint. If endpoint metadata is returned,
  // enforce it again locally so agent-harness-only models never enter the pool.
  if (Array.isArray(model.endpoints) && !model.endpoints.includes(CHAT_COMPLETIONS_ENDPOINT)) {
    return false;
  }
  // We send max_tokens in the Chat Completions request. Do not select a model
  // that explicitly says it cannot accept that parameter.
  if (Array.isArray(model.supported_parameters) && !model.supported_parameters.includes("max_tokens")) {
    return false;
  }
  return true;
}

function statusCodeOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = Number(candidate.status ?? candidate.statusCode);
  return Number.isFinite(value) ? value : undefined;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * A provider can advertise a free model in its public catalog while restricting
 * it to agentic harnesses. Treat model/route capability failures as a reason to
 * try the next candidate, not as a fatal failure for the entire agent.
 */
function shouldTryNextModel(error: unknown): boolean {
  const status = statusCodeOf(error);
  const message = errorMessageOf(error).toLowerCase();
  const modelSpecific = /agentic harness|only available on|not available on|unsupported model|model not found|no endpoint|provider.*(?:unavailable|not found)|does not support/.test(message);

  if (modelSpecific) return true;
  // Some upstream model providers return 401 when their own route rejects
  // authentication. Try another catalog candidate; a gateway-wide bad key will
  // still fail all attempts and the final error will be surfaced to the caller.
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 408 ||
      status === 409 || status === 425 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  // Network/transport errors often have no HTTP status; give another provider a chance.
  return status === undefined;
}

async function validateOpenRouterCredential(apiKey: string, signal?: AbortSignal): Promise<void> {
  if (credentialValidatedAt && Date.now() - credentialValidatedAt < 300_000) return;
  const response = await fetch(new URL(`${config.OPENROUTER_BASE_URL}/key`), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(CATALOG_TIMEOUT_MS)]) : AbortSignal.timeout(CATALOG_TIMEOUT_MS)
  });
  if (!response.ok) {
    console.error("[Forge3D] OpenRouter credential validation failed", {
      status: response.status,
      authorizationHeaderSent: true,
      keyConfigured: apiKey.length > 0
    });
    throw Object.assign(new Error(`OPENROUTER_API_KEY rejeitada pelo endpoint autenticado /key: HTTP ${response.status}`), { statusCode: response.status });
  }
  credentialValidatedAt = Date.now();
  console.info("[Forge3D] OpenRouter credential validated", { status: response.status });
}

export async function freeModels(signal?: AbortSignal): Promise<Model[]> {
  if (!hasOpenRouter) {
    throw Object.assign(new Error("OPENROUTER_API_KEY ausente"), { statusCode: 503 });
  }
  const apiKey = config.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw Object.assign(new Error("OPENROUTER_API_KEY vazia após remover espaços"), { statusCode: 503 });
  }
  await validateOpenRouterCredential(apiKey, signal);
  if (catalogCache && Date.now() - catalogCache.at < 300_000) {
    return catalogCache.models;
  }

  const catalogSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(CATALOG_TIMEOUT_MS)])
    : AbortSignal.timeout(CATALOG_TIMEOUT_MS);
  const url = new URL(`${config.OPENROUTER_BASE_URL}/models`);
  // Explicitly request models routed through the standard OpenAI-compatible
  // Chat Completions API, excluding decision/agent-harness-only models.
  url.searchParams.set("endpoints", CHAT_COMPLETIONS_ENDPOINT);
  url.searchParams.set("output_modalities", "text");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: catalogSignal
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Falha no catálogo OpenRouter: ${response.status}`), { statusCode: response.status });
  }

  const body = await response.json() as { data?: Model[] };
  const models = (body.data ?? []).filter(model =>
    typeof model.id === "string" &&
    model.id.endsWith(":free") &&
    isTextCapable(model) &&
    supportsChatCompletions(model)
  );

  catalogCache = { at: Date.now(), models };
  return models;
}

export async function completeAgent(systemPrompt: string, input: unknown): Promise<string> {
  const budgetSignal = AbortSignal.timeout(AGENT_BUDGET_MS);
  const models = await freeModels(budgetSignal);
  if (!models.length) {
    throw Object.assign(
      new Error("Nenhum modelo gratuito compatível com Chat Completions disponível; job aguardando"),
      { statusCode: 503 }
    );
  }

  const start = modelCursor % models.length;
  modelCursor = (modelCursor + 1) % models.length;
  const candidates = [...models.slice(start), ...models.slice(0, start)].slice(0, MAX_MODEL_ATTEMPTS);
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    const requestHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const response = await fetch(input, init);
    if (!loggedOpenRouterTransport) {
      loggedOpenRouterTransport = true;
      let responseHost = "unknown";
      try { responseHost = new URL(response.url).host; } catch { /* ignore malformed response URL */ }
      console.info("[Forge3D] OpenRouter completion transport diagnostic", {
        requestHost: new URL(requestUrl).host,
        authorizationHeaderPresent: requestHeaders.has("authorization"),
        bearerCredentialPresent: requestHeaders.get("authorization")?.startsWith("Bearer ") === true && (requestHeaders.get("authorization")?.length ?? 0) > 7,
        redirected: response.redirected,
        responseHost,
        status: response.status
      });
    }
    return response;
  };
  const client = new OpenAI({
    apiKey,
    baseURL: config.OPENROUTER_BASE_URL,
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: 0,
    fetch: diagnosticFetch,
    defaultHeaders: {
      ...(config.OPENROUTER_SITE_URL ? { "HTTP-Referer": config.OPENROUTER_SITE_URL } : {}),
      "X-Title": config.OPENROUTER_APP_NAME
    }
  });

  let lastError: unknown;
  for (const model of candidates) {
    if (budgetSignal.aborted) break;
    try {
      const requestSignal = AbortSignal.any([budgetSignal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]);
      const result = await client.chat.completions.create({
        model: model.id,
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(input) }
        ]
      }, { signal: requestSignal });
      const content = result.choices[0]?.message.content;
      if (typeof content === "string" && content.trim()) return content;
      lastError = new Error("Resposta vazia do modelo");
      console.warn("[Forge3D] OpenRouter model returned an empty response; trying fallback", { model: model.id });
    } catch (error) {
      lastError = error;
      const status = statusCodeOf(error);
      if (!shouldTryNextModel(error)) throw error;
      console.warn("[Forge3D] OpenRouter model unavailable for standard API; trying fallback", {
        model: model.id,
        status,
        reason: errorMessageOf(error).slice(0, 220)
      });
    }
  }

  if (budgetSignal.aborted) throw new Error("Tempo máximo do agente excedido");
  throw lastError instanceof Error ? lastError : new Error("Todos os modelos gratuitos compatíveis falharam");
}
