const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {notifyUsageThreshold}=require('./nsr-notifications');

async function rpc(name,body={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const text=await r.text();
  if(!r.ok) throw new Error(`Supabase RPC ${r.status}: ${text}`);
  const data=text?JSON.parse(text):null;
  return Array.isArray(data)?data[0]:data;
}

async function getClientBySlug(slug){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug&limit=1`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
  });
  const data=await r.json();
  if(!r.ok) throw new Error(`Supabase client lookup ${r.status}`);
  return Array.isArray(data)?data[0]:null;
}

async function reserveAiResponse(clientId){
  const usage=await rpc('nsr_reserve_ai_response',{p_client_id:clientId});
  if(usage?.newly_crossed_threshold){
    try{await notifyUsageThreshold(clientId,usage);}catch(error){console.error('USAGE NOTIFICATION ERROR:',error);}
  }
  return usage;
}
async function releaseAiResponse(clientId){return rpc('nsr_release_ai_response',{p_client_id:clientId});}
async function currentUsage(clientId){return rpc('nsr_current_usage',{p_client_id:clientId});}

module.exports={getClientBySlug,reserveAiResponse,releaseAiResponse,currentUsage};
