import type { WeaponVisualSpec, RGB } from "./weapon-spec.js";

export type MeshData = { positions: number[]; indices: number[]; colors: number[]; triangleCount: number };

const STEEL: RGB = [0.72, 0.79, 0.88];
const GOLD: RGB = [0.72, 0.48, 0.16];
const DARK: RGB = [0.12, 0.10, 0.09];

function quad(out: number[], colors: number[], a: [number,number,number], b: [number,number,number], c: [number,number,number], d: [number,number,number], color: RGB) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) colors.push(...color);
}
function box(out: number[], colors: number[], cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB) {
  const x=sx/2, y=sy/2, z=sz/2;
  const p=(a:number,b:number,c:number):[number,number,number]=>[cx+a,cy+b,cz+c];
  quad(out,colors,p(-x,-y,z),p(x,-y,z),p(x,y,z),p(-x,y,z),color);
  quad(out,colors,p(x,-y,-z),p(-x,-y,-z),p(-x,y,-z),p(x,y,-z),color);
  quad(out,colors,p(-x,-y,-z),p(-x,-y,z),p(-x,y,z),p(-x,y,-z),color);
  quad(out,colors,p(x,-y,z),p(x,-y,-z),p(x,y,-z),p(x,y,z),color);
  quad(out,colors,p(-x,y,z),p(x,y,z),p(x,y,-z),p(-x,y,-z),color);
  quad(out,colors,p(-x,-y,-z),p(x,-y,-z),p(x,-y,z),p(-x,-y,z),color);
}
function taperedBlade(out: number[], colors: number[], baseY: number, tipY: number, width: number, thickness: number, color: RGB, centerX = 0, centerZ = 0) {
  const z=thickness/2, w=width/2, tipW=0.004;
  const p=(x:number,y:number,depth:number):[number,number,number]=>[centerX+x,y,centerZ+depth];
  const a=p(-w,baseY,-z), b=p(w,baseY,-z), c=p(tipW,tipY,-z), d=p(-tipW,tipY,-z);
  const e=p(-w,baseY,z), f=p(w,baseY,z), g=p(tipW,tipY,z), h=p(-tipW,tipY,z);
  quad(out,colors,a,b,c,d,color); quad(out,colors,f,e,h,g,color);
  quad(out,colors,e,a,d,h,color); quad(out,colors,b,f,g,c,color);
  quad(out,colors,d,c,g,h,color); quad(out,colors,e,f,b,a,color);
}

export function createSwordMesh(maxTriangles=20000, visual?: WeaponVisualSpec): MeshData {
  const positions:number[]=[];
  const colors:number[]=[];
  const primary = visual?.palette.primary ?? STEEL;
  const bladeColor = visual?.effects.fire ? STEEL : primary;
  taperedBlade(positions,colors,0.2,2.1,0.34,0.075,bladeColor);
  box(positions,colors,0,0.12,0,0.82,0.12,0.16,GOLD);
  box(positions,colors,0,-0.42,0,0.16,0.92,0.16,DARK);
  box(positions,colors,0,-0.94,0,0.29,0.18,0.24,GOLD);

  if (visual?.blade.flameAccent) {
    // Three tapered green flame tongues sit just off the blade surface.
    taperedBlade(positions,colors,0.48,1.88,0.075,0.018,primary,-0.105,0.052);
    taperedBlade(positions,colors,0.72,2.02,0.065,0.018,primary,0.105,0.055);
    taperedBlade(positions,colors,0.35,1.42,0.055,0.016,primary,0.015,0.058);
  }

  const triangleCount=positions.length/9;
  if (triangleCount > maxTriangles) throw new Error("Orçamento de triângulos excedido");
  const indices=Array.from({length:positions.length/3},(_,i)=>i);
  return {positions,indices,colors,triangleCount};
}
export function meshToObj(mesh: MeshData): string {
  const lines=["# Forge3D Cloud procedural mesh"];
  for(let i=0;i<mesh.positions.length;i+=3) lines.push(`v ${mesh.positions[i]} ${mesh.positions[i+1]} ${mesh.positions[i+2]}`);
  for(let i=0;i<mesh.indices.length;i+=3) lines.push(`f ${mesh.indices[i]!+1} ${mesh.indices[i+1]!+1} ${mesh.indices[i+2]!+1}`);
  return lines.join("\n");
}