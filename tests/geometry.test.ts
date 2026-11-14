import { describe,it,expect } from "vitest";
import { createSwordMesh,meshToObj } from "../src/geometry.js";
import { meshToGlb } from "../src/glb.js";

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
});