const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {isAdminSession}=require('./_admin-session');

const AI_MODEL_NAME='Claude Sonnet 4.6';
const INPUT_PRICE_PER_MILLION=3;
const OUTPUT_PRICE_PER_MILLION=15;
const AED_PER_USD=3.6725;

async function supabaseRequest(path){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method:'GET',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}});
  const text=await response.text();
  if(!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text?JSON.parse(text):[];
}
async function supabaseRpc(name,body={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text=await response.text();
  if(!response.ok) throw new Error(`Supabase RPC ${response.status}: ${text}`);
  return text?JSON.parse(text):[];
}
function safeSlug(value){const slug=String(value||'').trim().toLowerCase();return /^[a-z0-9_-]{2,80}$/.test(slug)?slug:null;}
function first(rows){return Array.isArray(rows)&&rows.length?rows[0]:{};}
function daysUntil(value){if(!value)return null;const target=new Date(value);if(Number.isNaN(target.getTime()))return null;const now=new Date();const a=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());const b=Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),target.getUTCDate());return Math.round((b-a)/86400000);}
function tokenCostAed(input,output){const usd=(Number(input||0)/1000000)*INPUT_PRICE_PER_MILLION+(Number(output||0)/1000000)*OUTPUT_PRICE_PER_MILLION;return usd*AED_PER_USD;}
function buildPortfolio(clients,allAiUsage=[]){
  const rows=Array.isArray(clients)?clients:[];
  const ai=Array.isArray(allAiUsage)?allAiUsage:[];
  const totalInput=ai.reduce((s,x)=>s+Number(x.total_input_tokens||0),0);
  const totalOutput=ai.reduce((s,x)=>s+Number(x.total_output_tokens||0),0);
  const totalAiCost=tokenCostAed(totalInput,totalOutput);
  const summary={
    active_clients:rows.filter(x=>['active','trial'].includes(x.subscription_status)).length,
    essential:rows.filter(x=>x.plan_code==='essential').length,
    pro:rows.filter(x=>x.plan_code==='pro').length,
    enterprise:rows.filter(x=>x.plan_code==='enterprise').length,
    mrr_aed:Number(rows.reduce((s,x)=>s+Number(x.monthly_fee_aed||0),0).toFixed(2)),
    allocated_responses:rows.reduce((s,x)=>s+Number(x.monthly_limit||0),0),
    used_responses:rows.reduce((s,x)=>s+Number(x.used||0),0),
    remaining_responses:rows.reduce((s,x)=>s+Number(x.remaining||0),0),
    total_input_tokens:totalInput,total_output_tokens:totalOutput,total_ai_cost_aed:Number(totalAiCost.toFixed(2)),
    at_50:rows.filter(x=>Number(x.usage_percent||0)>=50).length,
    at_75:rows.filter(x=>Number(x.usage_percent||0)>=75).length,
    at_90:rows.filter(x=>Number(x.usage_percent||0)>=90).length,
    at_100:rows.filter(x=>Number(x.usage_percent||0)>=100).length,
    due_within_7_days:rows.filter(x=>{const d=daysUntil(x.cycle_end);return d!==null&&d>=0&&d<=7;}).length,
    overdue_payments:rows.filter(x=>{const d=daysUntil(x.cycle_end);return d!==null&&d<0&&['active','trial'].includes(x.subscription_status);}).length
  };
  summary.portfolio_utilization_percent=summary.allocated_responses?Number((summary.used_responses/summary.allocated_responses*100).toFixed(1)):0;
  summary.estimated_contribution_aed=Number((summary.mrr_aed-summary.total_ai_cost_aed).toFixed(2));
  summary.ai_cost_percent_of_mrr=summary.mrr_aed?Number((summary.total_ai_cost_aed/summary.mrr_aed*100).toFixed(1)):0;
  return summary;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({error:'Server configuration is incomplete'});
  if(!isAdminSession(req))return res.status(401).json({error:'Unauthorized'});
  const clientSlug=safeSlug(req.body?.client_slug||req.body?.client);
  if(!clientSlug)return res.status(400).json({error:'Valid client_slug is required'});
  try{
    const summaryRows=await supabaseRequest(`client_dashboard_stats?slug=eq.${encodeURIComponent(clientSlug)}&select=*`);
    if(!Array.isArray(summaryRows)||!summaryRows.length)return res.status(404).json({error:'Client statistics not found'});
    const summary=summaryRows[0],clientId=summary.client_id;
    const [unansweredRows,aiResolutionRows,languageRows,aiUsageRows,allAiUsageRows]=await Promise.all([
      supabaseRequest(`unanswered_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`),
      supabaseRequest(`ai_resolution_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`),
      supabaseRequest(`language_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`),
      supabaseRequest(`ai_usage_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`),
      supabaseRequest('ai_usage_dashboard_stats?select=*')
    ]);
    const unanswered=first(unansweredRows),aiResolution=first(aiResolutionRows),languageStats=first(languageRows),aiUsage=first(aiUsageRows);
    const totalInputTokens=Number(aiUsage.total_input_tokens||0),totalOutputTokens=Number(aiUsage.total_output_tokens||0),totalTokens=Number(aiUsage.total_tokens||(totalInputTokens+totalOutputTokens));
    const inputCostUsd=(totalInputTokens/1000000)*INPUT_PRICE_PER_MILLION,outputCostUsd=(totalOutputTokens/1000000)*OUTPUT_PRICE_PER_MILLION,totalCostUsd=inputCostUsd+outputCostUsd,totalCostAed=totalCostUsd*AED_PER_USD;
    let packagesReady=false,usage=null,portfolio=null,packageClients=[];
    try{
      packageClients=await supabaseRequest('nsr_admin_usage_overview?select=*&order=usage_percent.desc');
      packagesReady=true;usage=(Array.isArray(packageClients)?packageClients:[]).find(x=>String(x.slug||'').toLowerCase()===clientSlug)||null;portfolio=buildPortfolio(packageClients,allAiUsageRows);
    }catch(packageError){
      console.warn('NSR PACKAGE VIEW UNAVAILABLE:',packageError.message);
      try{const current=await supabaseRpc('nsr_current_usage',{p_client_id:clientId});usage=first(current);if(usage&&usage.plan_code){usage={...usage,slug:clientSlug,client_name:summary.client_name};packagesReady=true;}}catch(rpcError){console.warn('NSR PACKAGE RPC UNAVAILABLE:',rpcError.message);}
    }
    const paymentDays=usage?daysUntil(usage.cycle_end):null;
    return res.status(200).json({
      client:{client_id:summary.client_id,client_name:summary.client_name,slug:summary.slug,next_payment_date:usage?.cycle_end||null,days_to_payment:paymentDays},
      operations:{total_conversations:Number(summary.total_conversations||0),total_messages:Number(summary.total_messages||0),total_contact_requests:Number(summary.total_contact_requests||0),callback_requests:Number(summary.callback_requests||0),human_handoff_requests:Number(summary.human_handoff_requests||0),total_unanswered_questions:Number(unanswered.total_unanswered_questions||0),unresolved_unanswered_questions:Number(unanswered.unresolved_unanswered_questions||0),ai_resolution_rate_percent:Number(aiResolution.ai_resolution_rate_percent||0),arabic_conversations:Number(languageStats.arabic_conversations||0),english_conversations:Number(languageStats.english_conversations||0)},
      ai_usage:{model:AI_MODEL_NAME,total_input_tokens:totalInputTokens,total_output_tokens:totalOutputTokens,total_tokens:totalTokens,ai_usage_records:Number(aiUsage.ai_usage_records||0),input_price_per_million_usd:INPUT_PRICE_PER_MILLION,output_price_per_million_usd:OUTPUT_PRICE_PER_MILLION,input_cost_usd:Number(inputCostUsd.toFixed(6)),output_cost_usd:Number(outputCostUsd.toFixed(6)),total_cost_usd:Number(totalCostUsd.toFixed(6)),total_cost_aed:Number(totalCostAed.toFixed(4))},
      packages_ready:packagesReady,usage,portfolio,package_clients:packagesReady?packageClients:[]
    });
  }catch(error){console.error('ADMIN DASHBOARD API ERROR:',error);return res.status(500).json({error:'Unable to load admin dashboard statistics'});}
};
