import { describe, expect, it } from "vitest";
import { parseWeaponSpec } from "../src/weapon-spec.js";

describe("weapon visual specification", () => {
  it("derives green fire and aura from a Portuguese player description", () => {
    const spec = parseWeaponSpec("uma espada de fogo verde com aura verde", "");
    expect(spec.weapon.type).toBe("sword");
    expect(spec.palette.primary).toEqual([0.12, 0.95, 0.08]);
    expect(spec.effects.fire).toBe(true);
    expect(spec.effects.aura).toBe(true);
    expect(spec.blade.flameAccent).toBe(true);
  });
  it("recognizes distinct weapon shapes from Portuguese descriptions", () => {
    const cases = [["katana japonesa", "katana"], ["machado de guerra", "axe"], ["lança de gelo", "spear"], ["adaga sombria", "dagger"], ["martelo de guerra", "hammer"], ["cajado mágico", "staff"], ["arco élfico", "bow"]] as const;
    for (const [description, expected] of cases) {
      expect(parseWeaponSpec(description, "").weapon.type).toBe(expected);
    }
  });
  it("uses validated AI colors and honors a valid AI weapon type", () => {
    const spec = parseWeaponSpec("espada azul", JSON.stringify({
      result: { visual: { weapon: {type:"axe"}, palette: { primary: [0.05, 0.2, 0.95], emissive: [0.02, 0.08, 0.8] }, effects: { fire: false, aura: true }, blade: { flameAccent: false } } }
    }));
    expect(spec.weapon.type).toBe("axe");
    expect(spec.palette.primary).toEqual([0.05, 0.2, 0.95]);
    expect(spec.effects.fire).toBe(false);
    expect(spec.effects.aura).toBe(true);
  });
  it("ignores invalid AI color values and falls back to safe description defaults", () => {
    const spec = parseWeaponSpec("espada verde", JSON.stringify({ result: { visual: { palette: { primary: [9, -4, 2] } } } }));
    expect(spec.palette.primary).toEqual([0.12, 0.95, 0.08]);
  });
});
