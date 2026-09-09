const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {isAdminSession}=require('./_admin-session');

async function sb(path,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method:options.method||'GET',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',...(options.prefer?{Prefer:options.prefer}:{})},
    body:options.body?JSON.stringify(options.body):undefined
  });
  const t=await r.text();
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${t}`);
  return t?JSON.parse(t):null;
}
function clean(v){return String(v||'').trim();}
function validUrl(v){if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({error:'Server configuration error'});
  if(!isAdminSession(req))return res.status(401).json({error:'Unauthorized'});
  try{
    const clientId=clean(req.method==='GET'?req.query.client_id:req.body?.client_id);
    if(!clientId)return res.status(400).json({error:'client_id is required'});
    const rows=await sb(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,name,slug,config&limit=1`);
    const client=Array.isArray(rows)?rows[0]:null;
    if(!client)return res.status(404).json({error:'Client not found'});
    const config=client.config&&typeof client.config==='object'?client.config:{};
    if(req.method==='GET')return res.status(200).json({success:true,branding:{logo_url:clean(config.logo_url),brand_name:clean(config.brand_name)||client.name}});
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const logoUrl=clean(req.body?.logo_url);
    if(!validUrl(logoUrl))return res.status(400).json({error:'رابط الشعار غير صالح'});
    const brandName=clean(req.body?.brand_name)||client.name;
    await sb(`clients?id=eq.${encodeURIComponent(clientId)}`,{method:'PATCH',prefer:'return=minimal',body:{config:{...config,logo_url:logoUrl,brand_name:brandName}}});
    return res.status(200).json({success:true,branding:{logo_url:logoUrl,brand_name:brandName}});
  }catch(error){console.error('CLIENT BRANDING ERROR:',error);return res.status(500).json({error:'Unable to save client branding'});}
};
