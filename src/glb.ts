import type { MeshData } from "./geometry.js";

const align4=(n:number)=>Math.ceil(n/4)*4;
export function meshToGlb(mesh: MeshData): Uint8Array {
  const count=mesh.positions.length/3;
  const pos=new Float32Array(mesh.positions);
  const idx=new Uint32Array(mesh.indices);
  const posBytes=Buffer.from(pos.buffer);
  const idxBytes=Buffer.from(idx.buffer);
  const indexOffset=align4(posBytes.length);
  const binaryLength=align4(indexOffset+idxBytes.length);
  const binary=Buffer.alloc(binaryLength);
  posBytes.copy(binary,0); idxBytes.copy(binary,indexOffset);
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.length;i+=3) for(let a=0;a<3;a++){min[a]=Math.min(min[a]!,pos[i+a]!);max[a]=Math.max(max[a]!,pos[i+a]!);}
  const json={
    asset:{version:"2.0",generator:"Forge3D Cloud"},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"WeaponModel"}],
    meshes:[{name:"ProceduralWeapon",primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:binaryLength}],
    bufferViews:[
      {buffer:0,byteOffset:0,byteLength:posBytes.length,target:34962},
      {buffer:0,byteOffset:indexOffset,byteLength:idxBytes.length,target:34963}
    ],
    accessors:[
      {bufferView:0,componentType:5126,count,type:"VEC3",min,max},
      {bufferView:1,componentType:5125,count:idx.length,type:"SCALAR"}
    ]
  };
  const jsonBytes=Buffer.from(JSON.stringify(json));
  const jsonLength=align4(jsonBytes.length);
  const total=12+8+jsonLength+8+binaryLength;
  const out=Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);
  out.writeUInt32LE(jsonLength,12);out.writeUInt32LE(0x4e4f534a,16);
  jsonBytes.copy(out,20);out.fill(0x20,20+jsonBytes.length,20+jsonLength);
  const binHeader=20+jsonLength;out.writeUInt32LE(binaryLength,binHeader);out.writeUInt32LE(0x004e4942,binHeader+4);
  binary.copy(out,binHeader+8);
  return new Uint8Array(out);
}