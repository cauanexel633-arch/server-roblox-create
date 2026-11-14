import { completeAgent } from "./openrouter.js";

export const AGENTS = [
  ["IntentRouter", "Classifique intenção, categoria e estilo do pedido de asset Roblox."],
  ["SpecInterpreter", "Converta o pedido em WeaponSpec JSON validável. Não invente arquivos."],
  ["ReferenceScout", "Liste referências e termos de pesquisa; não afirme que pesquisou se não houver ferramenta."],
  ["ArtDirector", "Defina silhueta, proporções, paleta e materiais com coerência visual."],
  ["Modeler", "Planeje componentes geométricos e dimensões normalizadas para a malha."],
  ["Texturer", "Defina parâmetros e mapas PBR requeridos; identifique o que ainda não foi rasterizado."],
  ["Rigger", "Defina hierarquia óssea quando houver suporte; não alegue rig criado sem dados."],
  ["Animator", "Especifique clipes e keyframes necessários sem declarar animação inexistente."],
  ["VFXArtist", "Especifique efeitos Roblox e parâmetros reais."],
  ["Scripter", "Produza Luau seguro, --!strict, sem lógica autoritativa no cliente."],
  ["Reviewer", "Revise consistência e liste defeitos verificáveis."],
  ["Optimizer", "Avalie orçamento de triângulos, materiais e custo."],
  ["SecurityAuditor", "Identifique padrões de risco no código recebido; não substitui parser Luau/VM."],
  ["Librarian", "Produza metadados e termos para catalogação do artefato."],
  ["Packager", "Defina arquivos, hashes e manifesto para entrega."]
] as const;

export type AgentName = typeof AGENTS[number][0];
export const agentPrompts: Record<AgentName, string> = Object.fromEntries(AGENTS.map(([name, prompt]) => [name, `Você é o agente ${name} do Forge3D Cloud. ${prompt} Responda em JSON válido, sem markdown, com campos result e limitations.`])) as Record<AgentName, string>;

export async function runAgent(name: AgentName, input: unknown) {
  const prompt = agentPrompts[name];
  if (!prompt) throw new Error(`Agente desconhecido: ${name}`);
  return completeAgent(prompt, input);
}