const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {isAdminSession}=require('./_admin-session');
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
function validSlug(v){const slug=clean(v).toLowerCase();return /^[a-z0-9_-]{2,80}$/.test(slug)?slug:'';}
function language(v){return v==='en'?'en':'ar';}
async function getClient(slug){const rows=await db(`clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug&limit=1`);return Array.isArray(rows)?rows[0]||null:null;}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({error:'Server configuration is incomplete'});
  if(!isAdminSession(req))return res.status(401).json({error:'Unauthorized'});

  const body=req.body||{};
  const slug=validSlug(body.client_slug);
  if(!slug)return res.status(400).json({error:'Valid client_slug is required'});

  try{
    const client=await getClient(slug);
    if(!client)return res.status(404).json({error:'Client not found'});
    const action=clean(body.action);

    if(action==='list'){
      const rows=await db(`unanswered_questions?client_id=eq.${encodeURIComponent(client.id)}&resolved=eq.false&select=id,question,approved_answer,resolved,resolved_at,created_at&order=created_at.desc`);
      return res.status(200).json({success:true,client,questions:Array.isArray(rows)?rows:[]});
    }

    if(action==='resolve'){
      const questionId=clean(body.question_id);
      const approvedAnswer=clean(body.approved_answer);
      const lang=language(body.language);
      if(!questionId)return res.status(400).json({error:'question_id is required'});
      if(!approvedAnswer)return res.status(400).json({error:'approved_answer is required'});
      if(approvedAnswer.length>6000)return res.status(400).json({error:'approved_answer is too long'});

      const rows=await db('rpc/nsr_resolve_unanswered_question',{
        method:'POST',
        body:{p_client_id:client.id,p_question_id:questionId,p_answer:approvedAnswer,p_language:lang,p_source:'admin'}
      });
      const row=Array.isArray(rows)?rows[0]||null:rows;
      if(!row?.question_id)throw new Error('Atomic unanswered resolution returned no result');
      return res.status(200).json({success:true,message:"Approved answer saved to selected client's knowledge base",client,question_id:row.question_id,knowledge_base:{id:row.knowledge_id,action:row.knowledge_action}});
    }

    return res.status(400).json({error:'Invalid action'});
  }catch(error){
    const message=String(error?.message||'').toLowerCase();
    if(message.includes('question not found'))return res.status(404).json({error:'Question not found for this client'});
    if(message.includes('question already resolved'))return res.status(409).json({error:'Question is already resolved'});
    safeErrorLog('UNANSWERED_ADMIN_API_ERROR',error,{client_slug:slug});
    return res.status(500).json({error:'Unable to manage unanswered questions'});
  }
};
