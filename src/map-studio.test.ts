import { describe,expect,it,vi } from "vitest";
vi.mock("./agents.js",()=>({runAgent:vi.fn(async(name:string)=>{
 if(name==="MapInterpreter")return JSON.stringify({result:{theme:"Arena",genre:"PvP",biome:"Desert",scale:{width:400,depth:300}}});
 if(name==="MapArchitect")return JSON.stringify({result:{regions:[{id:"mid",name:"Centro",center:[0,0,0],size:[100,20,100]}],spawns:[[0,4,0],[20,4,20]]}});
 if(name==="MapElementPlanner")return JSON.stringify({result:{elements:[{id:"rock",kind:"rock",position:[10,0,10],size:[8,8,8]}]}});
 if(name==="MapModeler3D")return JSON.stringify({result:{models:[{id:"tower",kind:"tower",position:[0,0,0],size:[20,40,20]}]}});
 if(name==="MapPaletteDirector")return JSON.stringify({result:{palette:{primary:[0.1,0.2,0.3],barrier:[1,0,0]}}});
 if(name==="MapReviewer")return JSON.stringify({result:{approved:true,findings:[]}});
 if(name==="MapReferenceScout")return JSON.stringify({result:{references:[{url:"https://example.com/map-ref",title:"Reference"}],search_queries:["desert pvp map"]}});
 return JSON.stringify({result:{colliders:[{id:"fake",kind:"mandatory_perimeter_barrier",anchored:false,can_collide:false,size:[2,2,2]}]}});
})}));
import {buildMapStudioPlan,validateMapStudioPlan} from "./map-studio.js";
import {compileMapStudioPackage} from "./map-builder.js";
describe("Forge3D Map Studio",()=>{
 it("always inserts four anchored collidable perimeter barriers",async()=>{const p=await buildMapStudioPlan("Arena de deserto");expect(p.colliders.filter(c=>c.kind==="mandatory_perimeter_barrier")).toHaveLength(4);expect(p.colliders.some(c=>c.id==="safety_recovery_floor"&&c.required)).toBe(true);expect(p.colliders.every(c=>c.anchored&&c.can_collide)).toBe(true);expect(p.safety.closed_perimeter).toBe(true);expect(validateMapStudioPlan(p).valid).toBe(true);});
 it("rejects a missing boundary wall",async()=>{const p=await buildMapStudioPlan("Arena");p.colliders=p.colliders.filter(c=>c.id!=="safety_wall_north");expect(validateMapStudioPlan(p).valid).toBe(false);});
 it("rejects non-HTTPS and local reference URLs",async()=>{const p=await buildMapStudioPlan("Arena");expect(p.references.candidates).toHaveLength(1);});
 it("filters models outside playable bounds",async()=>{const p=await buildMapStudioPlan("Arena");expect(p.models.every(m=>Math.abs(m.position[0])+m.size[0]/2<=p.bounds.width/2)).toBe(true);});
});
