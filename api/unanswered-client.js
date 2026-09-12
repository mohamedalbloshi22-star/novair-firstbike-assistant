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
function lang(v){return v==='en'?'en':'ar';}
async function getClientById(id){const rows=await db(`clients?id=eq.${encodeURIComponent(id)}&select=id,name,slug,config&limit=1`);return Array.isArray(rows)?rows[0]||null:null;}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({success:false,error:'Server configuration error'});
  const session=getClientSession(req);
  if(!session)return res.status(401).json({success:false,error:'Unauthorized'});
  try{
    const client=await getClientById(session.client_id);
    if(!client||client.config?.active===false)return res.status(403).json({success:false,error:'Client inactive'});
    const body=req.body||{};
    if(clean(body.action)!=='resolve')return res.status(400).json({success:false,error:'Invalid action'});
    const questionId=clean(body.question_id);
    const approvedAnswer=clean(body.approved_answer);
    const language=lang(body.language);
    if(!questionId||!approvedAnswer)return res.status(400).json({success:false,error:'Question and approved answer are required'});
    if(approvedAnswer.length>6000)return res.status(400).json({success:false,error:'Approved answer is too long'});

    const rows=await db('rpc/nsr_resolve_unanswered_question',{
      method:'POST',
      body:{p_client_id:client.id,p_question_id:questionId,p_answer:approvedAnswer,p_language:language,p_source:'client_portal'}
    });
    const row=Array.isArray(rows)?rows[0]||null:rows;
    if(!row?.question_id)throw new Error('Atomic unanswered resolution returned no result');
    return res.status(200).json({success:true});
  }catch(error){
    const message=String(error?.message||'').toLowerCase();
    if(message.includes('question not found'))return res.status(404).json({success:false,error:'Question not found'});
    if(message.includes('question already resolved'))return res.status(409).json({success:false,error:'Question already resolved'});
    safeErrorLog('UNANSWERED_CLIENT_ERROR',error);
    return res.status(500).json({success:false,error:'Unable to resolve question'});
  }
};
