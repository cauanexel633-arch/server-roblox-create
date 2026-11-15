import { describe, expect, it } from "vitest";
import { parseWeaponSpec } from "../src/weapon-spec.js";

describe("weapon visual specification", () => {
  it("derives green fire and aura from a Portuguese player description", () => {
    const spec = parseWeaponSpec("uma espada de fogo verde com aura verde", "");
    expect(spec.palette.primary).toEqual([0.12, 0.95, 0.08]);
    expect(spec.effects.fire).toBe(true);
    expect(spec.effects.aura).toBe(true);
    expect(spec.blade.flameAccent).toBe(true);
  });

  it("uses validated AI colors when they are supplied in the agent JSON", () => {
    const spec = parseWeaponSpec("espada azul", JSON.stringify({
      result: {
        visual: {
          palette: { primary: [0.05, 0.2, 0.95], emissive: [0.02, 0.08, 0.8] },
          effects: { fire: false, aura: true },
          blade: { flameAccent: false }
        }
      }
    }));
    expect(spec.palette.primary).toEqual([0.05, 0.2, 0.95]);
    expect(spec.effects.fire).toBe(false);
    expect(spec.effects.aura).toBe(true);
  });

  it("ignores invalid AI color values and falls back to safe description defaults", () => {
    const spec = parseWeaponSpec("espada verde", JSON.stringify({
      result: { visual: { palette: { primary: [9, -4, 2] } } }
    }));
    expect(spec.palette.primary).toEqual([0.12, 0.95, 0.08]);
  });
});
