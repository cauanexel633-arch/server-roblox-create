import type { Config } from '../config.js';

export interface PedidoIA {
  system: string;
  user: string;
  timeoutMs: number;
}

/** Interface genérica: devolve o texto bruto. O parse é feito no domínio. */
export interface ProvedorIA {
  gerarTexto(pedido: PedidoIA): Promise<string>;
}

export type CausaProvedor = 'timeout' | 'http' | 'rede' | 'resposta_vazia';

export class ErroProvedor extends Error {
  constructor(
    readonly causa: CausaProvedor,
    readonly status?: number,
  ) {
    super(`provedor de IA: ${causa}`);
  }
}

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterProvedor implements ProvedorIA {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async gerarTexto({ system, user, timeoutMs }: PedidoIA): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(URL_OPENROUTER, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'criador-backend',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          // Saída JSON estrita; alguns modelos gratuitos não suportam, nesse caso vira erro_api.
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Não incluímos o corpo da resposta: pode ecoar dados sensíveis.
        throw new ErroProvedor('http', res.status);
      }
      const corpo = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
      const conteudo = corpo.choices?.[0]?.message?.content;
      if (typeof conteudo !== 'string' || conteudo.length === 0) {
        throw new ErroProvedor('resposta_vazia');
      }
      return conteudo;
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof Error && e.name === 'AbortError') throw new ErroProvedor('timeout');
      throw new ErroProvedor('rede');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function criarProvedor(config: Pick<Config, 'AI_PROVIDER' | 'AI_API_KEY' | 'AI_MODEL'>): ProvedorIA {
  switch (config.AI_PROVIDER) {
    case 'openrouter':
      return new OpenRouterProvedor(config.AI_API_KEY, config.AI_MODEL);
  }
}
