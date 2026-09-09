const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {isAdminSession}=require('./_admin-session');

async function get(path){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}});
  const text=await r.text();
  if(!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text?JSON.parse(text):[];
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!isAdminSession(req)) return res.status(401).json({error:'Unauthorized'});
  try{
    const rows=await get('nsr_admin_usage_overview?select=*&order=usage_percent.desc');
    const clients=Array.isArray(rows)?rows:[];
    const summary={
      active_clients:clients.filter(x=>['active','trial'].includes(x.subscription_status)).length,
      essential:clients.filter(x=>x.plan_code==='essential').length,
      pro:clients.filter(x=>x.plan_code==='pro').length,
      enterprise:clients.filter(x=>x.plan_code==='enterprise').length,
      mrr_aed:Number(clients.reduce((s,x)=>s+Number(x.monthly_fee_aed||0),0).toFixed(2)),
      allocated_responses:clients.reduce((s,x)=>s+Number(x.monthly_limit||0),0),
      used_responses:clients.reduce((s,x)=>s+Number(x.used||0),0),
      at_70:clients.filter(x=>Number(x.usage_percent||0)>=70).length,
      at_85:clients.filter(x=>Number(x.usage_percent||0)>=85).length,
      at_95:clients.filter(x=>Number(x.usage_percent||0)>=95).length,
      capped:clients.filter(x=>x.warning_level==='CAP_REACHED').length
    };
    summary.portfolio_utilization_percent=summary.allocated_responses?Number((summary.used_responses/summary.allocated_responses*100).toFixed(1)):0;
    return res.status(200).json({success:true,summary,clients});
  }catch(error){
    console.error('ADMIN USAGE API ERROR:',error);
    return res.status(500).json({error:'Unable to load admin package usage'});
  }
};
