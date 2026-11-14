import { randomUUID, createHash } from "node:crypto";
import { requireDatabase } from "./db.js";
import { config } from "./config.js";
import { createSwordMesh, meshToObj } from "./geometry.js";
import { meshToGlb } from "./glb.js";
import { runAgent } from "./agents.js";

type RobloxOperation = {
  path?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: { assetId?: number | string; path?: string; moderationResult?: { moderationState?: string } };
};

async function publishGlbToRoblox(
  db: ReturnType<typeof requireDatabase>,
  jobId: string,
  tenantId: string,
  description: string,
  existingResult: Record<string, unknown>,
  glbPath: string
): Promise<{ assetId: string; assetPath: string }> {
  if (!config.ROBLOX_OPEN_CLOUD_API_KEY || !config.ROBLOX_CREATOR_USER_ID) {
    throw new Error("Publicação Roblox não configurada: verifique ROBLOX_OPEN_CLOUD_API_KEY e ROBLOX_CREATOR_USER_ID na Vercel.");
  }

  const creatorId = Number(config.ROBLOX_CREATOR_USER_ID);
  if (!Number.isSafeInteger(creatorId) || creatorId <= 0) {
    throw new Error("ROBLOX_CREATOR_USER_ID inválido.");
  }

  let operationPath = typeof existingResult.roblox_operation_path === "string"
    ? existingResult.roblox_operation_path
    : "";

  if (!operationPath) {
    const { data: file, error: downloadError } = await db.storage.from("packages").download(glbPath);
    if (downloadError || !file) throw new Error(`Não foi possível recuperar o GLB para publicar: ${downloadError?.message ?? "arquivo ausente"}`);

    const form = new FormData();
    form.append("request", JSON.stringify({
      assetType: "Model",
      displayName: `Forge3D-${jobId.slice(0, 8)}`,
      description: `Arma gerada pelo Forge3D. Job: ${jobId}. ${description.slice(0, 700)}`,
      creationContext: {
        creator: { userId: creatorId },
        // Never allow an unexpected Robux upload charge.
        expectedPrice: 0
      }
    }));
    form.append("fileContent", new Blob([await file.arrayBuffer()], { type: "model/gltf-binary" }), `forge3d-${jobId}.glb`);

    const uploadResponse = await fetch("https://apis.roblox.com/assets/v1/assets", {
      method: "POST",
      headers: { "x-api-key": config.ROBLOX_OPEN_CLOUD_API_KEY },
      body: form,
      signal: AbortSignal.timeout(25000)
    });
    const uploadBody = await uploadResponse.json().catch(() => ({})) as RobloxOperation & { message?: string };
    if (!uploadResponse.ok) {
      const detail = uploadBody.error?.message ?? uploadBody.message ?? `HTTP ${uploadResponse.status}`;
      throw new Error(`Roblox Create Asset falhou: ${String(detail).slice(0, 350)}`);
    }
    if (!uploadBody.path || !/^operations\/[A-Za-z0-9_-]+$/.test(uploadBody.path)) {
      throw new Error("Roblox não retornou um caminho de operação válido.");
    }
    operationPath = uploadBody.path;
    const { error: saveOperationError } = await db.from("forge_jobs")
      .update({ result: { ...existingResult, roblox_operation_path: operationPath }, updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("tenant_id", tenantId);
    if (saveOperationError) throw new Error(`Não foi possível salvar a operação de publicação: ${saveOperationError.message}`);
  }

  const operationId = operationPath.slice("operations/".length);
  let operation: RobloxOperation | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(`https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(operationId)}`, {
      headers: { "x-api-key": config.ROBLOX_OPEN_CLOUD_API_KEY },
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({})) as RobloxOperation;
    if (!response.ok) {
      const detail = body.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Roblox Get Operation falhou: ${String(detail).slice(0, 350)}`);
    }
    operation = body;
    if (body.done) break;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  if (!operation?.done) throw new Error("Roblox ainda está processando o modelo; a fila tentará consultar a mesma operação novamente.");
  if (operation.error) throw new Error(`Roblox rejeitou a publicação: ${operation.error.message ?? operation.error.code ?? "erro desconhecido"}`);

  const assetId = operation.response?.assetId;
  const assetPath = operation.response?.path ?? (assetId ? `assets/${assetId}` : "");
  if (!assetId || !assetPath) throw new Error("Roblox concluiu a operação sem retornar assetId.");

  return { assetId: String(assetId), assetPath };
}

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
    console.info("[Forge3D] agent started", { job_id, stage: "SpecInterpreter" });
    const intent=await runAgent("SpecInterpreter",{
      description,
      category:request.category,
      style:request.style,
      server_policy:request.server_prompt,
      player_user_id: (request.player as {user_id?:string}|undefined)?.user_id
    });
    console.info("[Forge3D] agent completed", { job_id, stage: "SpecInterpreter" });
    const mesh=createSwordMesh(config.MAX_TRIANGLES);
    const glb=meshToGlb(mesh);
    const obj=meshToObj(mesh);
    const base=`${tenant_id}/${job_id}`;
    const glbPath=`${base}/weapon.glb`,objPath=`${base}/weapon.obj`;
    const {error:glbError}=await db.storage.from("packages").upload(glbPath,glb,{contentType:"model/gltf-binary",upsert:true});
    if(glbError) throw new Error(`Upload GLB: ${glbError.message}`);
    const previousResult = (job.result && typeof job.result === "object" ? job.result : {}) as Record<string, unknown>;
    const robloxAsset = await publishGlbToRoblox(db, job_id, tenant_id, description, previousResult, glbPath);
    const {error:objError}=await db.storage.from("packages").upload(objPath,Buffer.from(obj),{contentType:"text/plain",upsert:true});
    if(objError) throw new Error(`Upload OBJ: ${objError.message}`);
    const manifest={schema_version:"1.0",job_id,tenant_id,description,roblox_asset:robloxAsset,mesh:{vertices:mesh.positions.length/3,triangles:mesh.triangleCount},artifacts:[{path:glbPath,mime:"model/gltf-binary",sha256:createHash("sha256").update(glb).digest("hex")},{path:objPath,mime:"text/plain",sha256:createHash("sha256").update(obj).digest("hex")}],agent_spec: safeJson(intent),limitations:["UV/PBR textures, rigging, keyframed animation and Roblox RBXMX are not generated in this release."]};
    const manifestPath=`${base}/manifest.json`;
    const {error:manifestError}=await db.storage.from("packages").upload(manifestPath,Buffer.from(JSON.stringify(manifest,null,2)),{contentType:"application/json",upsert:true});
    if(manifestError) throw new Error(`Upload manifesto: ${manifestError.message}`);
    const {error:artifactError}=await db.from("forge_artifacts").upsert([{tenant_id,job_id,kind:"glb",storage_path:glbPath,sha256:manifest.artifacts[0]!.sha256},{tenant_id,job_id,kind:"obj",storage_path:objPath,sha256:manifest.artifacts[1]!.sha256},{tenant_id,job_id,kind:"manifest",storage_path:manifestPath,sha256:createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}],{onConflict:"job_id,kind"});
    if(artifactError) throw new Error(`Persistência de artefatos: ${artifactError.message}`);
    await db.from("forge_job_stages").upsert({job_id,tenant_id,stage:"S1-S4",status:"completed",output:{triangles:mesh.triangleCount},completed_at:new Date().toISOString()},{onConflict:"job_id,stage"});
    await db.from("forge_jobs").update({status:"completed",progress:100,current_stage:"completed",result:{manifest_path:manifestPath,asset_id:robloxAsset.assetId,asset_path:robloxAsset.assetPath},completed_at:new Date().toISOString()}).eq("id",job_id).eq("tenant_id",tenant_id);
    await db.rpc("forge_ack_job",{p_msg_id:msg.msg_id});
    return true;
  } catch(error) {
    const message=error instanceof Error?error.message:"unknown";
    console.error("[Forge3D] job failed; scheduling retry", { job_id, message });
    const {data:state}=await db.from("forge_jobs").select("attempts").eq("id",job_id).eq("tenant_id",tenant_id).maybeSingle();
    const attempts=Number(state?.attempts??0)+1;
    if(attempts>=3){
      await db.from("forge_jobs").update({status:"failed",attempts,last_error:message.slice(0,500),error_code:"max_attempts"}).eq("id",job_id).eq("tenant_id",tenant_id);
      await db.rpc("forge_dlq_job",{p_msg_id:msg.msg_id,p_job_id:job_id,p_tenant_id:tenant_id,p_error:message});
    }else{
      await db.from("forge_jobs").update({status:"queued",attempts,last_error:message.slice(0,500)}).eq("id",job_id).eq("tenant_id",tenant_id);
      await db.rpc("forge_retry_job",{p_msg_id:msg.msg_id,p_delay_seconds:30*attempts});
    }
    throw error;
  }
}
function safeJson(value:string) {
  try { return JSON.parse(value) as unknown; } catch { return {raw:value}; }
}