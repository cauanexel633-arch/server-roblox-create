import { OpenAI } from "openai";
import { config, hasOpenRouter } from "./config.js";

type Model = { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { modality?: string } };
let catalogCache: { at: number; models: Model[] } | undefined;

// Keep every upstream call comfortably below the Vercel function's 60s ceiling.
const CATALOG_TIMEOUT_MS = 7_000;
const MODEL_TIMEOUT_MS = 12_000;
const MAX_MODEL_ATTEMPTS = 2;

export async function freeModels(): Promise<Model[]> {
  if (!hasOpenRouter) throw Object.assign(new Error("OPENROUTER_API_KEY ausente"), { statusCode: 503 });
  if (catalogCache && Date.now() - catalogCache.at < 300_000) return catalogCache.models;

  const response = await fetch(`${config.OPENROUTER_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${config.OPENROUTER_API_KEY}` },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Falha no catálogo OpenRouter: ${response.status}`);
  const body = await response.json() as { data?: Model[] };
  const models = (body.data ?? []).filter(model => model.id.endsWith(":free"));
  catalogCache = { at: Date.now(), models };
  return models;
}

export async function completeAgent(systemPrompt: string, input: unknown): Promise<string> {
  const models = await freeModels();
  if (!models.length) throw Object.assign(new Error("Nenhum modelo gratuito disponível; job aguardando"), { statusCode: 503 });

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
  for (const model of models.slice(0, MAX_MODEL_ATTEMPTS)) {
    try {
      const result = await client.chat.completions.create({
        model: model.id,
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(input) }
        ]
      });
      const content = result.choices[0]?.message.content;
      if (typeof content === "string" && content.trim()) return content;
      throw new Error("Resposta vazia do modelo");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Todos os modelos gratuitos falharam");
}
