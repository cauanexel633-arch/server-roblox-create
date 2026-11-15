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
function beam(out:number[], colors:number[], ax:number,ay:number,bx:number,by:number,width:number,depth:number,color:RGB) {
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  const cx=(ax+bx)/2,cy=(ay+by)/2,c=Math.cos(angle),s=Math.sin(angle);
  const p=(x:number,y:number,z:number):[number,number,number]=>[cx+x*c-y*s,cy+x*s+y*c,z];
  const x=len/2,y=width/2,z=depth/2;
  quad(out,colors,p(-x,-y,z),p(x,-y,z),p(x,y,z),p(-x,y,z),color);
  quad(out,colors,p(x,-y,-z),p(-x,-y,-z),p(-x,y,-z),p(x,y,-z),color);
  quad(out,colors,p(-x,-y,-z),p(-x,-y,z),p(-x,y,z),p(-x,y,-z),color);
  quad(out,colors,p(x,-y,z),p(x,-y,-z),p(x,y,-z),p(x,y,z),color);
  quad(out,colors,p(-x,y,z),p(x,y,z),p(x,y,-z),p(-x,y,-z),color);
  quad(out,colors,p(-x,-y,-z),p(x,-y,-z),p(x,-y,z),p(-x,-y,z),color);
}
function taperedBlade(out:number[],colors:number[],baseY:number,tipY:number,width:number,thickness:number,color:RGB,centerX=0,centerZ=0,tipWidth=0.008) {
  const z=thickness/2,w=width/2,tw=tipWidth/2;
  const p=(x:number,y:number,d:number):[number,number,number]=>[centerX+x,y,centerZ+d];
  const a=p(-w,baseY,-z),b=p(w,baseY,-z),c=p(tw,tipY,-z),d=p(-tw,tipY,-z);
  const e=p(-w,baseY,z),f=p(w,baseY,z),g=p(tw,tipY,z),h=p(-tw,tipY,z);
  quad(out,colors,a,b,c,d,color);quad(out,colors,f,e,h,g,color);
  quad(out,colors,e,a,d,h,color);quad(out,colors,b,f,g,c,color);
  quad(out,colors,d,c,g,h,color);quad(out,colors,e,f,b,a,color);
}
function addHandle(out:number[],colors:number[],length=0.9) {
  box(out,colors,0,-length/2,0,0.16,length,0.16,DARK);
  box(out,colors,0,-length*0.88,0,0.29,0.18,0.24,GOLD);
}
export function createWeaponMesh(maxTriangles=20000,visual?:WeaponVisualSpec):MeshData {
  const positions:number[]=[],colors:number[]=[];
  const primary=visual?.palette.primary??STEEL;
  const type=visual?.weapon.type??"sword";
  if(type==="sword") {
    taperedBlade(positions,colors,0.2,2.1,0.34,0.075,STEEL);
    box(positions,colors,0,0.12,0,0.82,0.12,0.16,GOLD);addHandle(positions,colors);
  } else if(type==="katana") {
    // Narrow, long, slightly curved-looking blade with a long wrapped grip and circular guard.
    taperedBlade(positions,colors,0.05,2.25,0.22,0.055,STEEL,0.04,0,0.012);
    box(positions,colors,0,0.02,0,0.48,0.055,0.12,GOLD);addHandle(positions,colors,0.72);
    for(let i=0;i<5;i++) beam(positions,colors,-0.075,-0.2-i*0.12,0.075,-0.12-i*0.12,0.025,0.18,primary);
  } else if(type==="axe") {
    addHandle(positions,colors,1.05);
    box(positions,colors,0,0.12,0,0.18,0.18,0.2,GOLD);
    // Broad crescent-like head assembled from a wide cutting face and a reinforced socket.
    taperedBlade(positions,colors,0.12,1.0,0.78,0.12,STEEL,0.34,0.02,0.48);
    box(positions,colors,0.31,0.57,0.025,0.16,0.66,0.2,GOLD);
  } else if(type==="spear") {
    addHandle(positions,colors,2.35);
    taperedBlade(positions,colors,1.05,2.2,0.42,0.09,STEEL,0,0,0.02);
    taperedBlade(positions,colors,1.12,1.72,0.12,0.11,GOLD,0,0.015,0.025);
  } else if(type==="dagger") {
    taperedBlade(positions,colors,0.05,1.15,0.28,0.07,STEEL,0,0,0.025);
    box(positions,colors,0,-0.02,0,0.5,0.1,0.17,GOLD);addHandle(positions,colors,0.52);
  } else if(type==="hammer") {
    addHandle(positions,colors,1.1);
    box(positions,colors,0,0.58,0,0.95,0.58,0.42,STEEL);
    box(positions,colors,0,0.58,0,0.2,0.62,0.46,GOLD);
  } else if(type==="staff") {
    box(positions,colors,0,0.05,0,0.13,2.15,0.13,DARK);
    box(positions,colors,0,1.12,0,0.48,0.48,0.34,GOLD);
    taperedBlade(positions,colors,0.95,1.52,0.24,0.2,primary,0,0.04,0.04);
  } else if(type==="bow") {
    beam(positions,colors,0,-1.05,0.22,0,0.12,0.12,GOLD);
    beam(positions,colors,0.22,0,0,1.05,0.12,0.12,GOLD);
    beam(positions,colors,0,-1.05,0,1.05,0.018,0.018,STEEL);
    beam(positions,colors,-0.02,0,0.02,0,0.07,0.07,DARK);
  }
  if(visual?.blade.flameAccent && type!=="bow" && type!=="hammer") {
    taperedBlade(positions,colors,0.45,1.82,0.065,0.018,primary,-0.13,0.065,0.012);
    taperedBlade(positions,colors,0.65,2.0,0.055,0.018,primary,0.13,0.065,0.012);
  }
  const triangleCount=positions.length/9;
  if(triangleCount>maxTriangles) throw new Error("Orçamento de triângulos excedido");
  const indices=Array.from({length:positions.length/3},(_,i)=>i);
  return {positions,indices,colors,triangleCount};
}
export const createSwordMesh=createWeaponMesh;
export function meshToObj(mesh:MeshData):string {
  const lines=["# Forge3D Cloud procedural mesh"];
  for(let i=0;i<mesh.positions.length;i+=3) lines.push(`v ${mesh.positions[i]} ${mesh.positions[i+1]} ${mesh.positions[i+2]}`);
  for(let i=0;i<mesh.indices.length;i+=3) lines.push(`f ${mesh.indices[i]!+1} ${mesh.indices[i+1]!+1} ${mesh.indices[i+2]!+1}`);
  return lines.join("\n");
}
