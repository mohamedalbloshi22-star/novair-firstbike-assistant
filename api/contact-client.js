const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {getClientSession}=require('./_client-session');
const {safeErrorLog}=require('../lib/nsr-safe-log');

async function db(path,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method:options.method||'GET',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',Prefer:options.prefer||'return=representation'},
    body:options.body?JSON.stringify(options.body):undefined
  });
  const text=await r.text();
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${text}`);
  return text?JSON.parse(text):[];
}

function clean(v){return String(v||'').trim();}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({success:false,error:'Server configuration error'});
  const session=getClientSession(req);
  if(!session)return res.status(401).json({success:false,error:'Unauthorized'});
  try{
    const clients=await db(`clients?id=eq.${encodeURIComponent(session.client_id)}&select=id,config&limit=1`);
    const client=Array.isArray(clients)?clients[0]||null:null;
    if(!client)return res.status(404).json({success:false,error:'Client not found'});
    if(client.config?.active===false)return res.status(403).json({success:false,error:'Client inactive'});

    const body=req.body||{};
    if(clean(body.action)!=='update_status')return res.status(400).json({success:false,error:'Invalid action'});
    const requestId=clean(body.request_id);
    const status=clean(body.status);
    const allowed=['new','in_progress','completed','closed'];
    if(!requestId||!allowed.includes(status))return res.status(400).json({success:false,error:'Invalid request'});
    const rows=await db(`contact_requests?id=eq.${encodeURIComponent(requestId)}&client_id=eq.${encodeURIComponent(session.client_id)}&select=id&limit=1`);
    if(!Array.isArray(rows)||!rows.length)return res.status(404).json({success:false,error:'Contact request not found'});
    await db(`contact_requests?id=eq.${encodeURIComponent(requestId)}&client_id=eq.${encodeURIComponent(session.client_id)}`,{method:'PATCH',body:{status},prefer:'return=minimal'});
    return res.status(200).json({success:true});
  }catch(error){
    safeErrorLog('CONTACT_CLIENT_ERROR',error,{client_id:session.client_id});
    return res.status(500).json({success:false,error:'Unable to update contact request'});
  }
};