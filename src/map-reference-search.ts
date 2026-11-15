export type MapSearchResult = { url:string; title:string; reason:string };
type TavilyResponse = { results?: Array<{url?:unknown;title?:unknown;content?:unknown}> };
function safeHttps(value:unknown):string|null{
 if(typeof value!=="string"||value.length>1000)return null;
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)return null;const h=u.hostname.toLowerCase();if(h==="localhost"||h.endsWith(".localhost")||h==="127.0.0.1"||h==="::1"||/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;return u.toString();}catch{return null;}
}
/** Uses Tavily only when configured. Search queries are data, never URLs to fetch directly. */
export async function searchMapReferences(queries:string[],apiKey=process.env.TAVILY_API_KEY):Promise<{results:MapSearchResult[];status:"search_results"|"unavailable"}>{
 if(!apiKey)return {results:[],status:"unavailable"};
 const selected=[...new Set(queries.filter(q=>typeof q==="string"&&q.trim()).map(q=>q.trim().slice(0,350)))].slice(0,3);
 const batches=await Promise.allSettled(selected.map(async query=>{
  const response=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({query,search_depth:"basic",max_results:5,include_answer:false,include_raw_content:false,include_images:false}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Tavily search failed: HTTP ${response.status}`);
  return await response.json() as TavilyResponse;
 }));
 const results:MapSearchResult[]=[];
 for(const batch of batches)if(batch.status==="fulfilled")for(const item of batch.value.results??[]){const url=safeHttps(item.url);if(!url)continue;results.push({url,title:typeof item.title==="string"?item.title.slice(0,160):"Visual reference",reason:typeof item.content==="string"?item.content.slice(0,400):"Resultado de pesquisa online"});}
 return {results:results.slice(0,10),status:results.length?"search_results":"unavailable"};
}
