import { OpenAI } from "openai";
import { config, hasOpenRouter } from "./config.js";

type Model = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string };
};
let catalogCache: { at: number; models: Model[] } | undefined;
let modelCursor = 0;

// One hard budget for catalog lookup and model fallback; Vercel must retain time to finalize a job.
const AGENT_BUDGET_MS = 20_000;
const CATALOG_TIMEOUT_MS = 5_000;
const MODEL_TIMEOUT_MS = 4_500;
const MAX_MODEL_ATTEMPTS = 4;

function isTextCapable(model: Model): boolean {
  const modality = model.architecture?.modality?.toLowerCase() ?? "";
  return modality.includes("text");
}

function statusCodeOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = Number(candidate.status ?? candidate.statusCode);
  return Number.isFinite(value) ? value : undefined;
}

function isPermanentClientError(error: unknown): boolean {
  const status = statusCodeOf(error);
  return status !== undefined &&
    status >= 400 && status < 500 &&
    ![404, 408, 409, 425, 429].includes(status);
}

export async function freeModels(signal?: AbortSignal): Promise<Model[]> {
  if (!hasOpenRouter) throw Object.assign(new Error("OPENROUTER_API_KEY ausente"), { statusCode: 503 });
  if (catalogCache && Date.now() - catalogCache.at < 300_000) return catalogCache.models;

  const catalogSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(CATALOG_TIMEOUT_MS)])
    : AbortSignal.timeout(CATALOG_TIMEOUT_MS);
  const response = await fetch(`${config.OPENROUTER_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${config.OPENROUTER_API_KEY}` },
    signal: catalogSignal
  });
  if (!response.ok) throw Object.assign(new Error(`Falha no catálogo OpenRouter: ${response.status}`), { statusCode: response.status });
  const body = await response.json() as { data?: Model[] };
  const models = (body.data ?? []).filter(model =>
    typeof model.id === "string" && model.id.endsWith(":free") && isTextCapable(model)
  );
  catalogCache = { at: Date.now(), models };
  return models;
}

export async function completeAgent(systemPrompt: string, input: unknown): Promise<string> {
  const budgetSignal = AbortSignal.timeout(AGENT_BUDGET_MS);
  const models = await freeModels(budgetSignal);
  if (!models.length) throw Object.assign(new Error("Nenhum modelo gratuito compatível com texto disponível; job aguardando"), { statusCode: 503 });

  const start = modelCursor % models.length;
  modelCursor = (modelCursor + 1) % models.length;
  const candidates = [...models.slice(start), ...models.slice(0, start)].slice(0, MAX_MODEL_ATTEMPTS);
  const client = new OpenAI({
    apiKey: config.OPENROUTER_API_KEY!,
    baseURL: config.OPENROUTER_BASE_URL,
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: 0,
    defaultHeaders: {
      ...(config.OPENROUTER_SITE_URL ? { "HTTP-Referer": config.OPENROUTER_SITE_URL } : {}),
      "X-Title": config.OPENROUTER_APP_NAME
    }
  });

  let lastError: unknown;
  for (const model of candidates) {
    if (budgetSignal.aborted) throw new Error("Tempo máximo do agente excedido");
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
    } catch (error) {
      lastError = error;
      if (isPermanentClientError(error)) throw error;
      if (budgetSignal.aborted) break;
    }
  }

  if (budgetSignal.aborted) throw new Error("Tempo máximo do agente excedido");
  throw lastError instanceof Error ? lastError : new Error("Todos os modelos gratuitos falharam");
}
