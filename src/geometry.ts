export type MeshData = { positions: number[]; indices: number[]; triangleCount: number };

function quad(out: number[], a: [number,number,number], b: [number,number,number], c: [number,number,number], d: [number,number,number]) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}
function box(out: number[], cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
  const x=sx/2, y=sy/2, z=sz/2;
  const p=(a:number,b:number,c:number):[number,number,number]=>[cx+a,cy+b,cz+c];
  quad(out,p(-x,-y,z),p(x,-y,z),p(x,y,z),p(-x,y,z));
  quad(out,p(x,-y,-z),p(-x,-y,-z),p(-x,y,-z),p(x,y,-z));
  quad(out,p(-x,-y,-z),p(-x,-y,z),p(-x,y,z),p(-x,y,-z));
  quad(out,p(x,-y,z),p(x,-y,-z),p(x,y,-z),p(x,y,z));
  quad(out,p(-x,y,z),p(x,y,z),p(x,y,-z),p(-x,y,-z));
  quad(out,p(-x,-y,-z),p(x,-y,-z),p(x,-y,z),p(-x,-y,z));
}
function taperedBlade(out: number[], baseY: number, tipY: number, width: number, thickness: number) {
  const y0=baseY, y1=tipY, z=thickness/2, w=width/2, tipW=0.004;
  const a:[number,number,number]=[-w,y0,-z], b:[number,number,number]=[w,y0,-z], c:[number,number,number]=[tipW,y1,-z], d:[number,number,number]=[-tipW,y1,-z];
  const e:[number,number,number]=[-w,y0,z], f:[number,number,number]=[w,y0,z], g:[number,number,number]=[tipW,y1,z], h:[number,number,number]=[-tipW,y1,z];
  quad(out,a,b,c,d); quad(out,f,e,h,g); quad(out,e,a,d,h); quad(out,b,f,g,c); quad(out,d,c,g,h); quad(out,e,f,b,a);
}
export function createSwordMesh(maxTriangles=20000): MeshData {
  const positions:number[]=[];
  taperedBlade(positions,0.2,2.1,0.34,0.075);
  box(positions,0,0.12,0,0.82,0.12,0.16);
  box(positions,0,-0.42,0,0.16,0.92,0.16);
  box(positions,0,-0.94,0,0.29,0.18,0.24);
  const triangleCount=positions.length/9;
  if (triangleCount > maxTriangles) throw new Error("Orçamento de triângulos excedido");
  const indices=Array.from({length:positions.length/3},(_,i)=>i);
  return {positions,indices,triangleCount};
}
export function meshToObj(mesh: MeshData): string {
  const lines=["# Forge3D Cloud procedural mesh"];
  for(let i=0;i<mesh.positions.length;i+=3) lines.push(`v ${mesh.positions[i]} ${mesh.positions[i+1]} ${mesh.positions[i+2]}`);
  for(let i=0;i<mesh.indices.length;i+=3) lines.push(`f ${mesh.indices[i]!+1} ${mesh.indices[i+1]!+1} ${mesh.indices[i+2]!+1}`);
  return lines.join("\n");
}