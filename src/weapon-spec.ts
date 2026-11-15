export type RGB = [number, number, number];
export type WeaponType = "sword" | "katana" | "axe" | "spear" | "dagger" | "hammer" | "staff" | "bow";

export type WeaponVisualSpec = {
  weapon: { type: WeaponType };
  palette: { primary: RGB; emissive: RGB };
  blade: { flameAccent: boolean };
  effects: { fire: boolean; aura: boolean };
};

const PALETTES: Record<string, RGB> = {
  green: [0.12, 0.95, 0.08], blue: [0.08, 0.35, 1], red: [1, 0.08, 0.06],
  purple: [0.62, 0.12, 1], gold: [1, 0.62, 0.08], ice: [0.35, 0.85, 1],
  default: [0.62, 0.68, 0.76]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readRgb(value: unknown): RGB | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  if (!value.every(channel => typeof channel === "number" && Number.isFinite(channel) && channel >= 0 && channel <= 1)) return undefined;
  return [value[0] as number, value[1] as number, value[2] as number];
}
function unwrapAgentResult(raw: string): Record<string, unknown> {
  try {
    let parsed: unknown = JSON.parse(raw);
    for (let depth = 0; depth < 3; depth++) {
      if (!isRecord(parsed)) return {};
      if (typeof parsed.result === "string") {
        try { parsed = JSON.parse(parsed.result); continue; } catch { return parsed; }
      }
      if (isRecord(parsed.result)) { parsed = parsed.result; continue; }
      return parsed;
    }
  } catch { return {}; }
  return {};
}
function inferWeaponType(text: string): WeaponType {
  if (/katana|刀/.test(text)) return "katana";
  if (/machad|axe|hatchet/.test(text)) return "axe";
  if (/lan[cç]a|spear|tridente|trident/.test(text)) return "spear";
  if (/adaga|punhal|dagger|dirk/.test(text)) return "dagger";
  if (/martelo|marreta|hammer|maul/.test(text)) return "hammer";
  if (/cajado|bast[aã]o|staff|scepter|cetro/.test(text)) return "staff";
  if (/arco|bow/.test(text)) return "bow";
  return "sword";
}
const TYPES = new Set<WeaponType>(["sword","katana","axe","spear","dagger","hammer","staff","bow"]);

export function parseWeaponSpec(description: string, agentOutput: string): WeaponVisualSpec {
  const text = description.toLowerCase();
  const agent = unwrapAgentResult(agentOutput);
  const visual = isRecord(agent.visual) ? agent.visual : {};
  const weapon = isRecord(visual.weapon) ? visual.weapon : {};
  const palette = isRecord(visual.palette) ? visual.palette : {};
  const blade = isRecord(visual.blade) ? visual.blade : {};
  const effects = isRecord(visual.effects) ? visual.effects : {};
  const requestedType = typeof weapon.type === "string" && TYPES.has(weapon.type as WeaponType)
    ? weapon.type as WeaponType : inferWeaponType(text);
  const colorName = /verde|green/.test(text) ? "green" : /azul|blue/.test(text) ? "blue"
    : /vermelh|red/.test(text) ? "red" : /roxo|p[uú]rpura|purple/.test(text) ? "purple"
    : /dourad|gold/.test(text) ? "gold" : /gelo|ice|congel/.test(text) ? "ice" : "default";
  const primary = readRgb(palette.primary) ?? PALETTES[colorName]!;
  const emissive = readRgb(palette.emissive) ?? primary.map(channel => Math.min(1, channel * 0.7)) as RGB;
  const hasFire = /fogo|chama|flame|fire/.test(text);
  const hasAura = /aura|energia|energy|brilho|glow/.test(text);
  return {
    weapon: { type: requestedType },
    palette: { primary, emissive },
    blade: { flameAccent: typeof blade.flameAccent === "boolean" ? blade.flameAccent : hasFire },
    effects: {
      fire: typeof effects.fire === "boolean" ? effects.fire : hasFire,
      aura: typeof effects.aura === "boolean" ? effects.aura : hasAura
    }
  };
}
