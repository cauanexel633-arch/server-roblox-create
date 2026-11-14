import Fastify from "fastify";
import { z } from "zod";
import { config, hasSupabase } from "./config.js";
import { requireDatabase } from "./db.js";
import { verifyForgeRequest } from "./security.js";
import { createJob, processOneJob } from "./jobs.js";

const app=Fastify({
  logger:{level:config.LOG_LEVEL,redact:{paths:["req.headers.authorization","req.headers.x-forge-signature","req.headers.x-forge-nonce"],censor:"[REDACTED]"}},
  bodyLimit:64*1024,
  genReqId:()=>crypto.randomUUID()
});
app.addContentTypeParser("application/json",{parseAs:"string"},(req,body,done)=>{
  try { const raw=String(body); (req as typeof req & {rawBody?:string}).rawBody=raw; done(null,JSON.parse(raw)); }
  catch(error){done(error as Error,undefined);}
});
const generateSchema=z.object({
  universe_id:z.number().int().positive(),
  player:z.object({user_id:z.union([z.string(),z.number()]),username:z.string().max(64).optional()}),
  weapon_description:z.string().min(8).max(4000),
  category:z.string().max(80).default("melee.sword"),
  style:z.string().max(80).default("fantasy"),
  constraints:z.object({max_tris:z.number().int().min(100).max(50000).default(18000),rarity:z.string().max(32).optional(),quality:z.enum(["low","medium","high","ultra","cinematic"]).default("high")}).default({}),
  idempotency_key:z.string().uuid()
});
async function authenticate(req: typeof app extends never ? never : import("fastify").FastifyRequest) {
  const raw=(req as typeof req & {rawBody?:string}).rawBody??"";
  await verifyForgeRequest(req.headers as Record<string,unknown>,raw);
}
app.get("/health",async()=>({status:"ok",service:"forge3d-cloud",version:"2.0.0"}));
app.get("/ready",async(_req,reply)=>{
  if(!hasSupabase) return reply.code(503).send({status:"not_ready",missing:["Supabase"]});
  const {error}=await requireDatabase().from("forge_jobs").select("id").limit(1);
  if(error) return reply.code(503).send({status:"not_ready",reason:"database_unavailable"});
  return {status:"ready"};
});
app.post("/v1/generate",async(req,reply)=>{
  await authenticate(req);
  const parsed=generateSchema.safeParse(req.body);
  if(!parsed.success) return reply.code(400).send({error:"invalid_request",details:parsed.error.flatten()});
  const db=requireDatabase();
  const {data:tenant,error}=await db.from("forge_tenants").select("id").eq("universe_id",parsed.data.universe_id).maybeSingle();
  if(error) throw error;
  if(!tenant) return reply.code(403).send({error:"universe_not_registered"});
  const result=await createJob(tenant.id,parsed.data as unknown as Record<string,unknown>,parsed.data.idempotency_key);
  return reply.code(202).send({job_id:result.id,status:result.status,progress:result.progress??0,status_url:`/v1/jobs/${result.id}`});
});
app.get("/v1/jobs/:id",async(req,reply)=>{
  await authenticate(req);
  const {id}=req.params as {id:string};
  const {data,error}=await requireDatabase().from("forge_jobs").select("id,status,progress,current_stage,last_error,created_at,updated_at,completed_at,result").eq("id",id).maybeSingle();
  if(error) throw error; if(!data) return reply.code(404).send({error:"not_found"}); return data;
});
app.post("/v1/jobs/:id/cancel",async(req,reply)=>{
  await authenticate(req);
  const {id}=req.params as {id:string};
  const {data,error}=await requireDatabase().from("forge_jobs").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",id).in("status",["queued","processing"]).select("id,status").maybeSingle();
  if(error) throw error; if(!data) return reply.code(404).send({error:"not_found_or_finished"}); return data;
});
app.get("/v1/weapons/:id/package",async(req,reply)=>{
  await authenticate(req);
  const {id}=req.params as {id:string};
  const db=requireDatabase();
  const {data:job}=await db.from("forge_jobs").select("id,status").eq("id",id).maybeSingle();
  if(!job||job.status!=="completed") return reply.code(404).send({error:"package_not_found"});
  const {data:files,error}=await db.from("forge_artifacts").select("kind,storage_path,sha256").eq("job_id",id);
  if(error) throw error;
  const artifacts=await Promise.all((files??[]).map(async file=>{
    const {data,error:signError}=await db.storage.from("packages").createSignedUrl(file.storage_path,300);
    if(signError) throw signError;
    return {...file,url:data.signedUrl,expires_in:300};
  }));
  return {job_id:id,artifacts};
});
app.post("/api/internal/process-queue",async(req,reply)=>{
  const auth=String(req.headers.authorization??"");
  if(!config.CRON_SECRET||auth!==`Bearer ${config.CRON_SECRET}`) return reply.code(401).send({error:"unauthorized"});
  let processed=0;
  for(let i=0;i<config.MAX_JOB_STAGES_PER_TICK;i++){const did=await processOneJob();if(!did)break;processed++;}
  return {processed};
});
app.setErrorHandler((error,req,reply)=>{
  req.log.error({err:error},"request_failed");
  const status=Number((error as {statusCode?:number}).statusCode??500);
  return reply.code(status>=400&&status<600?status:500).send({error:status>=500?"internal_error":"request_error",message:status>=500?"Falha interna":error.message,trace_id:req.id});
});
// Mantém o mesmo entrypoint compatível com execução local e o adaptador Fastify da Vercel.
if (process.env.VERCEL !== "1") app.listen({port:Number(process.env.PORT??3000)});
export default app;
