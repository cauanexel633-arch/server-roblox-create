import { describe,it,expect } from "vitest";
import { createWeaponMesh,createSwordMesh,meshToObj } from "../src/geometry.js";
import { meshToGlb } from "../src/glb.js";
import { parseWeaponSpec } from "../src/weapon-spec.js";

describe("procedural mesh pipeline",()=>{
  it("creates a non-empty deterministic triangular mesh",()=>{
    const a=createSwordMesh(),b=createSwordMesh();
    expect(a.triangleCount).toBeGreaterThan(0);
    expect(a.positions).toEqual(b.positions);
    expect(a.indices.length).toBe(a.positions.length/3);
  });
  it("exports OBJ and GLB with valid signatures",()=>{
    const mesh=createSwordMesh();
    expect(meshToObj(mesh)).toContain("f ");
    const glb=meshToGlb(mesh);
    expect(Buffer.from(glb).readUInt32LE(0)).toBe(0x46546c67);
    expect(Buffer.from(glb).readUInt32LE(4)).toBe(2);
  });
  it("adds description-driven green flame geometry and vertex colors",()=>{
    const spec=parseWeaponSpec("uma espada de fogo verde com aura verde","");
    const mesh=createWeaponMesh(20000,spec);
    expect(mesh.colors).toHaveLength(mesh.positions.length);
    expect(mesh.triangleCount).toBeGreaterThan(createSwordMesh().triangleCount);
    expect(mesh.colors.some((value,index)=>index%3===1&&value>0.9)).toBe(true);
    const glb=Buffer.from(meshToGlb(mesh));
    const jsonLength=glb.readUInt32LE(12);
    const json=JSON.parse(glb.subarray(20,20+jsonLength).toString("utf8").trim()) as {meshes:Array<{primitives:Array<{attributes:Record<string,number>}>}>};
    expect(json.meshes[0]?.primitives[0]?.attributes.COLOR_0).toBeDefined();
  });
  it("builds visibly different geometry for each supported weapon class",()=>{
    const types=["sword","katana","axe","spear","dagger","hammer","staff","bow"] as const;
    const signatures=types.map(type=>createWeaponMesh(20000,{weapon:{type},palette:{primary:[0.4,0.8,0.2],emissive:[0.2,0.5,0.1]},blade:{flameAccent:false},effects:{fire:false,aura:false}}).positions.join(","));
    expect(new Set(signatures).size).toBe(types.length);
  });
});
