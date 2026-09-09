const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {isAdminSession}=require('./_admin-session');

async function sb(path){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t}`);return t?JSON.parse(t):[];}
function clean(v){return String(v||'').trim();}
function safeSlug(v){const s=clean(v).toLowerCase();return /^[a-z0-9_-]{2,80}$/.test(s)?s:'';}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({error:'Server configuration error'});
  if(!isAdminSession(req))return res.status(401).json({error:'Unauthorized'});
  try{
    const slug=safeSlug(req.query?.client);
    if(!slug)return res.status(400).json({error:'Valid client is required'});
    const rows=await sb(`clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,config&limit=1`);
    const client=Array.isArray(rows)?rows[0]:null;
    if(!client)return res.status(404).json({error:'Client not found'});
    const cfg=client.config&&typeof client.config==='object'?client.config:{};
    let sub=null;
    try{
      const subs=await sb(`nsr_client_subscriptions?client_id=eq.${encodeURIComponent(client.id)}&select=plan_code,status,cycle_start,cycle_end,custom_ai_limit,setup_fee_override_aed,monthly_fee_override_aed,nsr_plans(code,name,setup_fee_aed,monthly_fee_aed,monthly_ai_responses)&limit=1`);
      sub=Array.isArray(subs)?subs[0]||null:null;
    }catch(e){console.warn('CONTRACT SUBSCRIPTION LOAD FAILED:',e.message)}
    const plan=Array.isArray(sub?.nsr_plans)?sub.nsr_plans[0]:sub?.nsr_plans||{};
    const monthlyLimit=Number(sub?.custom_ai_limit||plan?.monthly_ai_responses||0);
    const setupFee=Number(sub?.setup_fee_override_aed??plan?.setup_fee_aed??0);
    const monthlyFee=Number(sub?.monthly_fee_override_aed??plan?.monthly_fee_aed??0);
    return res.status(200).json({success:true,contract:{
      client_id:client.id,client_name:client.name,slug:client.slug,
      client_legal_name:clean(cfg.client_legal_name)||client.name,
      client_license_no:clean(cfg.client_license_no),
      contact_name:clean(cfg.contact_name),contact_phone:clean(cfg.contact_phone),contact_email:clean(cfg.contact_email),billing_email:clean(cfg.billing_email)||clean(cfg.contact_email),
      client_signatory_name:clean(cfg.client_signatory_name),client_signatory_title:clean(cfg.client_signatory_title),
      contract_start_date:clean(cfg.contract_start_date)||clean(sub?.cycle_start),contract_end_date:clean(cfg.contract_end_date)||clean(sub?.cycle_end),contract_term_months:Number(cfg.contract_term_months||0)||null,contract_status:clean(cfg.contract_status)||'draft',
      plan_code:clean(sub?.plan_code),plan_name:clean(plan?.name)||clean(sub?.plan_code),monthly_ai_limit:monthlyLimit,setup_fee_aed:setupFee,monthly_fee_aed:monthlyFee,next_payment_date:clean(sub?.cycle_end),
      novaire_signatory_name:process.env.NOVAIRE_SIGNATORY_NAME||'محمد علي البلوشي',novaire_signatory_title:process.env.NOVAIRE_SIGNATORY_TITLE||'المدير التنفيذي',novaire_signature_url:process.env.NOVAIRE_ESIGNATURE_URL||''
    }});
  }catch(error){console.error('CONTRACT DATA ERROR:',error);return res.status(500).json({error:'Unable to load contract data'});}
};
