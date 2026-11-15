import { describe, expect, it, vi } from "vitest";
import type { WeaponVisualSpec } from "./weapon-spec.js";
vi.mock("./agents.js",()=>({runAgent:vi.fn(async(name:string)=>{
 if(name==="WeaponLayoutDesigner")return JSON.stringify({result:{ui:{controls:["fire","aim","reload","bogus"]}}});
 if(name==="WeaponScripter")return JSON.stringify({result:{combat:{magazine_size:30,fire_mode:"auto",aim_enabled:true}}});
 if(name==="WeaponAnimationDirector")return JSON.stringify({result:{animations:{required:["fire","reload","not_an_action"],random_variants:["idle","inspect"],random_enabled:true}}});
 return JSON.stringify({result:{findings:[]}});
})}));
import { buildWeaponRuntimePlan } from "./weapon-runtime.js";
const visual:WeaponVisualSpec={weapon:{type:"sword"},palette:{primary:[1,0,0],emissive:[1,0,0]},blade:{flameAccent:false},effects:{fire:false,aura:false}};
describe("weapon runtime plan",()=>{
 it("builds firearm HUD and server-authoritative contract",async()=>{const p=await buildWeaponRuntimePlan("rifle automática futurista",visual);expect(p.combat_class).toBe("firearm");expect(p.ui.layout).toBe("firearm_hud");expect(p.combat.magazine_size).toBe(30);expect(p.combat.fire_mode).toBe("auto");expect(p.security.allow_client_damage).toBe(false);expect(p.security.require_server_raycast).toBe(true);expect(p.ui.controls).not.toContain("bogus");});
 it("hides ammo for melee weapons",async()=>{const p=await buildWeaponRuntimePlan("espada medieval",visual);expect(p.combat_class).toBe("melee");expect(p.ui.show_ammo).toBe(false);expect(p.ui.layout).toBe("melee_compact");expect(p.effects.swing_trail).toBe(true);});
 it("supports bows as projectile weapons",async()=>{const p=await buildWeaponRuntimePlan("arco longo de gelo",visual);expect(p.combat_class).toBe("projectile");expect(p.effects.projectile_tracer).toBe(true);});
});
