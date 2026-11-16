export interface LimitadorRate {
  permitir(chave: string): boolean;
}

/** Janela deslizante em memória. Troque por Redis ou similar se houver mais de uma instância. */
export class LimitadorJanela implements LimitadorRate {
  private readonly registros = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly janelaMs = 60_000,
    private readonly agora: () => number = Date.now,
  ) {}

  permitir(chave: string): boolean {
    const t = this.agora();
    const recentes = (this.registros.get(chave) ?? []).filter((x) => t - x < this.janelaMs);
    if (recentes.length >= this.max) {
      this.registros.set(chave, recentes);
      return false;
    }
    recentes.push(t);
    this.registros.set(chave, recentes);
    return true;
  }
}
