const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {isAdminSession}=require('./_admin-session');

async function sb(path){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json'
    }
  });
  const text=await r.text();
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${text}`);
  return text?JSON.parse(text):null;
}

function clean(v){return String(v??'').trim();}
function validSlug(v){const slug=clean(v).toLowerCase();return /^[a-z0-9_-]{2,80}$/.test(slug)?slug:'';}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({error:'Server configuration error'});
  if(!isAdminSession(req))return res.status(401).json({error:'Unauthorized'});

  const slug=validSlug(req.query?.client);
  if(!slug)return res.status(400).json({error:'Valid client is required'});

  try{
    const clients=await sb(`clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,config&limit=1`);
    const client=Array.isArray(clients)?clients[0]:null;
    if(!client)return res.status(404).json({error:'Client not found'});

    const cfg=client.config&&typeof client.config==='object'?client.config:{};
    let usage=null;
    try{
      const rows=await sb(`nsr_admin_usage_overview?client_id=eq.${encodeURIComponent(client.id)}&select=*&limit=1`);
      usage=Array.isArray(rows)?rows[0]||null:null;
    }catch(error){
      console.warn('CONTRACT USAGE OVERVIEW UNAVAILABLE:',error.message);
    }

    const contract={
      client_id:client.id,
      client_name:client.name,
      client_slug:client.slug,
      client_legal_name:clean(cfg.client_legal_name)||client.name,
      client_license_no:clean(cfg.client_license_no),
      client_signatory_name:clean(cfg.client_signatory_name),
      client_signatory_title:clean(cfg.client_signatory_title),
      contract_start_date:clean(cfg.contract_start_date)||clean(usage?.cycle_start),
      contract_end_date:clean(cfg.contract_end_date)||clean(usage?.cycle_end),
      contract_term_months:num(cfg.contract_term_months)||null,
      next_payment_date:clean(usage?.cycle_end),
      contact_email:clean(cfg.contact_email),
      billing_email:clean(cfg.billing_email)||clean(cfg.contact_email),
      plan_name:clean(usage?.plan_name)||clean(usage?.plan_code),
      monthly_ai_limit:num(usage?.monthly_limit),
      setup_fee_aed:num(usage?.setup_fee_aed),
      monthly_fee_aed:num(usage?.monthly_fee_aed),
      novaire_signatory_name:clean(cfg.novaire_signatory_name),
      novaire_signatory_title:clean(cfg.novaire_signatory_title),
      novaire_signature_url:clean(cfg.novaire_signature_url)
    };

    return res.status(200).json({success:true,contract});
  }catch(error){
    console.error('CONTRACT DATA ERROR:',error);
    return res.status(500).json({error:'Unable to load contract data'});
  }
};
