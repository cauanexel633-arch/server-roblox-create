import { randomUUID, createHash } from "node:crypto";
import { requireDatabase } from "./db.js";
import { config } from "./config.js";
import { createSwordMesh, meshToObj } from "./geometry.js";
import { meshToGlb } from "./glb.js";
import { runAgent } from "./agents.js";

export async function createJob(tenantId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const db=requireDatabase();
  const {data:existing}=await db.from("forge_jobs").select("id,status").eq("tenant_id",tenantId).eq("idempotency_key",idempotencyKey).maybeSingle();
  if(existing) return existing;
  const id=randomUUID();
  const {error}=await db.from("forge_jobs").insert({id,tenant_id:tenantId,status:"queued",progress:0,request:payload,idempotency_key:idempotencyKey,current_stage:"S1"});
  if(error) throw new Error(`Falha ao criar job: ${error.message}`);
  const {error:queueError}=await db.rpc("forge_enqueue_job",{p_job_id:id,p_tenant_id:tenantId});
  if(queueError) { await db.from("forge_jobs").update({status:"failed",error_code:"queue_error"}).eq("id",id); throw new Error("Falha ao enfileirar job"); }
  return {id,status:"queued",progress:0};
}

export async function processOneJob() {
  const db=requireDatabase();
  const {data:messages,error}=await db.rpc("forge_claim_jobs",{p_qty:1,p_visibility_seconds:90});
  if(error) throw new Error(`Falha ao consumir fila: ${error.message}`);
  const msg=messages?.[0] as {msg_id:number;message:{job_id:string;tenant_id:string}}|undefined;
  if(!msg) return false;
  const {job_id,tenant_id}=msg.message;
  try {
    const {data:job,error:readError}=await db.from("forge_jobs").select("*").eq("id",job_id).eq("tenant_id",tenant_id).single();
    if(readError||!job) throw new Error("Job não encontrado");
    if(job.status==="cancelled"||job.status==="completed") {
      await db.rpc("forge_ack_job",{p_msg_id:msg.msg_id}); return true;
    }
    await db.from("forge_jobs").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",job_id);
    const request=job.request as Record<string,unknown>;
    const description=String(request.weapon_description??"Arma de fantasia");
    const intent=await runAgent("SpecInterpreter",{description,category:request.category,style:request.style});
    const mesh=createSwordMesh(config.MAX_TRIANGLES);
    const glb=meshToGlb(mesh);
    const obj=meshToObj(mesh);
    const base=`${tenant_id}/${job_id}`;
    const glbPath=`${base}/weapon.glb`,objPath=`${base}/weapon.obj`;
    const {error:glbError}=await db.storage.from("packages").upload(glbPath,glb,{contentType:"model/gltf-binary",upsert:true});
    if(glbError) throw new Error(`Upload GLB: ${glbError.message}`);
    const {error:objError}=await db.storage.from("packages").upload(objPath,Buffer.from(obj),{contentType:"text/plain",upsert:true});
    if(objError) throw new Error(`Upload OBJ: ${objError.message}`);
    const manifest={schema_version:"1.0",job_id,tenant_id,description,mesh:{vertices:mesh.positions.length/3,triangles:mesh.triangleCount},artifacts:[{path:glbPath,mime:"model/gltf-binary",sha256:createHash("sha256").update(glb).digest("hex")},{path:objPath,mime:"text/plain",sha256:createHash("sha256").update(obj).digest("hex")}],agent_spec: safeJson(intent),limitations:["UV/PBR textures, rigging, keyframed animation and Roblox RBXMX are not generated in this release."]};
    const manifestPath=`${base}/manifest.json`;
    await db.storage.from("packages").upload(manifestPath,Buffer.from(JSON.stringify(manifest,null,2)),{contentType:"application/json",upsert:true});
    await db.from("forge_artifacts").insert([{tenant_id,job_id,kind:"glb",storage_path:glbPath,sha256:manifest.artifacts[0]!.sha256},{tenant_id,job_id,kind:"obj",storage_path:objPath,sha256:manifest.artifacts[1]!.sha256},{tenant_id,job_id,kind:"manifest",storage_path:manifestPath,sha256:createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}]);
    await db.from("forge_job_stages").upsert({job_id,tenant_id,stage:"S1-S4",status:"completed",output:{triangles:mesh.triangleCount},completed_at:new Date().toISOString()},{onConflict:"job_id,stage"});
    await db.from("forge_jobs").update({status:"completed",progress:100,current_stage:"completed",result:{manifest_path:manifestPath},completed_at:new Date().toISOString()}).eq("id",job_id).eq("tenant_id",tenant_id);
    await db.rpc("forge_ack_job",{p_msg_id:msg.msg_id});
    return true;
  } catch(error) {
    const message=error instanceof Error?error.message:"unknown";
    await db.from("forge_jobs").update({status:"queued",last_error:message.slice(0,500),attempts:(1)}).eq("id",job_id).eq("tenant_id",tenant_id);
    await db.rpc("forge_retry_job",{p_msg_id:msg.msg_id,p_delay_seconds:30});
    throw error;
  }
}
function safeJson(value:string) {
  try { return JSON.parse(value) as unknown; } catch { return {raw:value}; }
}