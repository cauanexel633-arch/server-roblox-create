import type { MeshData } from "./geometry.js";

const align4=(n:number)=>Math.ceil(n/4)*4;
export function meshToGlb(mesh: MeshData): Uint8Array {
  const count=mesh.positions.length/3;
  const posBytes=Buffer.from(new Float32Array(mesh.positions).buffer);
  const colorBytes=Buffer.from(new Float32Array(mesh.colors).buffer);
  const idxBytes=Buffer.from(new Uint32Array(mesh.indices).buffer);
  const colorOffset=align4(posBytes.length);
  const indexOffset=align4(colorOffset+colorBytes.length);
  const binaryLength=align4(indexOffset+idxBytes.length);
  const binary=Buffer.alloc(binaryLength);
  posBytes.copy(binary,0);
  colorBytes.copy(binary,colorOffset);
  idxBytes.copy(binary,indexOffset);

  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.positions.length;i+=3) for(let a=0;a<3;a++){
    min[a]=Math.min(min[a]!,mesh.positions[i+a]!);
    max[a]=Math.max(max[a]!,mesh.positions[i+a]!);
  }
  const json={
    asset:{version:"2.0",generator:"Forge3D Cloud"},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"WeaponModel"}],
    meshes:[{name:"GeneratedWeapon",primitives:[{attributes:{POSITION:0,COLOR_0:1},indices:2,material:0,mode:4}]}],
    materials:[{name:"WeaponMaterial",pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0.55,roughnessFactor:0.3},emissiveFactor:[0.16,0.16,0.16]}],
    buffers:[{byteLength:binaryLength}],
    bufferViews:[
      {buffer:0,byteOffset:0,byteLength:posBytes.length,target:34962},
      {buffer:0,byteOffset:colorOffset,byteLength:colorBytes.length,target:34962},
      {buffer:0,byteOffset:indexOffset,byteLength:idxBytes.length,target:34963}
    ],
    accessors:[
      {bufferView:0,componentType:5126,count,type:"VEC3",min,max},
      {bufferView:1,componentType:5126,count,type:"VEC3",min:[0,0,0],max:[1,1,1]},
      {bufferView:2,componentType:5125,count:mesh.indices.length,type:"SCALAR"}
    ]
  };
  const jsonBytes=Buffer.from(JSON.stringify(json));
  const jsonLength=align4(jsonBytes.length);
  const total=12+8+jsonLength+8+binaryLength;
  const out=Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);
  out.writeUInt32LE(jsonLength,12);out.writeUInt32LE(0x4e4f534a,16);
  jsonBytes.copy(out,20);out.fill(0x20,20+jsonBytes.length,20+jsonLength);
  const binHeader=20+jsonLength;
  out.writeUInt32LE(binaryLength,binHeader);out.writeUInt32LE(0x004e4942,binHeader+4);
  binary.copy(out,binHeader+8);
  return new Uint8Array(out);
}