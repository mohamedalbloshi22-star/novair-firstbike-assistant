const STRIPE_SECRET_KEY=process.env.STRIPE_SECRET_KEY;
const APP_URL=String(process.env.APP_URL||'').replace(/\/$/,'');
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function requireStripe(){if(!STRIPE_SECRET_KEY)throw new Error('STRIPE_NOT_CONFIGURED');}

async function stripe(path,params={}){
  requireStripe();
  const body=new URLSearchParams();
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined&&v!==null&&v!=='')body.append(k,String(v));
  }
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{
    method:'POST',
    headers:{Authorization:`Bearer ${STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const data=await r.json();
  if(!r.ok)throw new Error(`Stripe ${r.status}: ${data?.error?.message||'request failed'}`);
  return data;
}

async function stripeGet(path,query=''){
  requireStripe();
  const r=await fetch(`https://api.stripe.com/v1/${path}${query?`?${query}`:''}`,{
    headers:{Authorization:`Bearer ${STRIPE_SECRET_KEY}`}
  });
  const data=await r.json();
  if(!r.ok)throw new Error(`Stripe ${r.status}: ${data?.error?.message||'request failed'}`);
  return data;
}

async function readSubscription(clientId){
  const rows=await sb(`nsr_client_subscriptions?client_id=eq.${encodeURIComponent(clientId)}&select=*,nsr_plans(code,name,monthly_fee_aed,setup_fee_aed,stripe_monthly_price_id,stripe_setup_price_id)&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}

async function persistStripeSubscription(clientId,stripeSub,customerId=null){
  const priceId=stripeSub?.items?.data?.[0]?.price?.id||null;
  const patch={
    stripe_subscription_id:stripeSub?.id||null,
    stripe_price_id:priceId,
    stripe_status:stripeSub?.status||null,
    auto_renew:stripeSub?!stripeSub.cancel_at_period_end:false,
    cancel_at_period_end:!!stripeSub?.cancel_at_period_end,
    stripe_current_period_end:stripeSub?.current_period_end?new Date(stripeSub.current_period_end*1000).toISOString():null,
    billing_updated_at:new Date().toISOString()
  };
  if(customerId)patch.stripe_customer_id=customerId;
  await sb(`nsr_client_subscriptions?client_id=eq.${encodeURIComponent(clientId)}`,{method:'PATCH',prefer:'return=minimal',body:patch});
  return patch;
}

async function getSubscription(clientId){
  const sub=await readSubscription(clientId);
  if(!sub||!sub.stripe_subscription_id||!STRIPE_SECRET_KEY)return sub;
  try{
    const stripeSub=await stripeGet(`subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`,'expand[]=items.data.price');
    const patch=await persistStripeSubscription(clientId,stripeSub,sub.stripe_customer_id||null);
    return {...sub,...patch};
  }catch(error){
    console.warn('STRIPE SUBSCRIPTION REFRESH FAILED:',error.message);
    return sub;
  }
}

async function ensureStripeCustomer(client,subscription){
  if(subscription?.stripe_customer_id)return subscription.stripe_customer_id;
  const customer=await stripe('customers',{
    name:client.name||client.slug,
    'metadata[nsr_client_id]':client.id,
    'metadata[nsr_client_slug]':client.slug
  });
  await sb(`nsr_client_subscriptions?client_id=eq.${encodeURIComponent(client.id)}`,{
    method:'PATCH',prefer:'return=minimal',body:{stripe_customer_id:customer.id,billing_updated_at:new Date().toISOString()}
  });
  return customer.id;
}

function baseUrl(req){
  if(APP_URL)return APP_URL.startsWith('http')?APP_URL:`https://${APP_URL}`;
  const proto=req.headers['x-forwarded-proto']||'https';
  const host=req.headers['x-forwarded-host']||req.headers.host;
  return `${proto}://${host}`;
}

async function createCheckoutSession(req,client){
  const sub=await readSubscription(client.id);
  if(!sub)throw new Error('NO_ACTIVE_PLAN');
  if(sub.stripe_subscription_id&&['active','trialing','past_due'].includes(String(sub.stripe_status||'')))throw new Error('SUBSCRIPTION_ALREADY_EXISTS');
  const plan=Array.isArray(sub.nsr_plans)?sub.nsr_plans[0]:sub.nsr_plans;
  if(!plan?.stripe_monthly_price_id)throw new Error('STRIPE_PRICE_NOT_CONFIGURED');
  const customerId=await ensureStripeCustomer(client,sub);
  const url=baseUrl(req);
  const params={
    mode:'subscription',customer:customerId,
    success_url:`${url}/billing.html?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${url}/billing.html?billing=cancel`,
    'line_items[0][price]':plan.stripe_monthly_price_id,
    'line_items[0][quantity]':1,
    'subscription_data[metadata][nsr_client_id]':client.id,
    'subscription_data[metadata][plan_code]':sub.plan_code,
    'metadata[nsr_client_id]':client.id,
    'metadata[plan_code]':sub.plan_code
  };
  if(plan.stripe_setup_price_id){
    params['line_items[1][price]']=plan.stripe_setup_price_id;
    params['line_items[1][quantity]']=1;
  }
  const session=await stripe('checkout/sessions',params);
  return {url:session.url,id:session.id};
}

async function createPortalSession(req,client){
  const sub=await readSubscription(client.id);
  if(!sub?.stripe_customer_id)throw new Error('NO_STRIPE_CUSTOMER');
  const url=baseUrl(req);
  const session=await stripe('billing_portal/sessions',{customer:sub.stripe_customer_id,return_url:`${url}/billing.html`});
  return {url:session.url,id:session.id};
}

async function syncCheckoutSession(client,sessionId){
  if(!sessionId||!/^cs_/.test(sessionId))throw new Error('INVALID_CHECKOUT_SESSION');
  const data=await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`,'expand[]=subscription&expand[]=subscription.items.data.price');
  if(String(data.metadata?.nsr_client_id||'')!==String(client.id))throw new Error('CHECKOUT_CLIENT_MISMATCH');
  const stripeSub=data.subscription&&typeof data.subscription==='object'?data.subscription:null;
  if(!stripeSub)throw new Error('SUBSCRIPTION_NOT_READY');
  const patch=await persistStripeSubscription(client.id,stripeSub,data.customer||null);
  return {status:patch.stripe_status,subscription_id:stripeSub.id,price_id:patch.stripe_price_id};
}

module.exports={getSubscription,createCheckoutSession,createPortalSession,syncCheckoutSession};
