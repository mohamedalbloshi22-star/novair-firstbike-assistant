const { parseSession, cookieValue, requireTenant, securityHeaders } = require('../../lib/v2/security');
const ACTIONS = new Set(['dashboard','assistant.ask','knowledge.list','knowledge.create','knowledge.delete','support.list','support.create','support.update','settings.get','settings.update','admin.overview','admin.tenants']);
const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
module.exports=async function handler(req,res){
  securityHeaders(res);
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const claims=parseSession(cookieValue(req),process.env.BSR1_V2_SESSION_SECRET);
  if(!claims)return res.status(401).json({error:'AUTHENTICATION_REQUIRED'});
  const input=req.method==='GET'?req.query:(req.body||{}),action=clean(input.action,40),tenantId=clean(input.tenantId||claims.tenantId,60);
  if(!ACTIONS.has(action))return res.status(400).json({error:'INVALID_ACTION'});
  if(!requireTenant(claims,tenantId))return res.status(403).json({error:'TENANT_ACCESS_DENIED'});
  if(action.startsWith('admin.')&&claims.role!=='founder')return res.status(403).json({error:'FOUNDER_ONLY'});
  const url=process.env.BSR1_V2_SUPABASE_URL,key=process.env.BSR1_V2_SUPABASE_PUBLISHABLE_KEY,token=process.env.BSR1_V2_DATA_TOKEN;
  if(!url||!key||!token)return res.status(503).json({error:'PREVIEW_DATA_NOT_CONFIGURED'});
  const payload=input.payload&&typeof input.payload==='object'?input.payload:{};
  try{
    const response=await fetch(`${url}/rest/v1/rpc/bsr1_v2_product_api`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_action:action,p_tenant_slug:tenantId,p_payload:payload})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return res.status(response.status>=500?502:response.status).json({error:'DATA_OPERATION_FAILED'});
    return res.status(200).json(data);
  }catch{return res.status(502).json({error:'DATA_SERVICE_UNAVAILABLE'});}
};
