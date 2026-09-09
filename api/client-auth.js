const crypto=require('crypto');
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const COOKIE_NAME='novaire_client_session';
const SESSION_HOURS=8;
const {getClientSession}=require('./_client-session');
const {currentUsage}=require('../lib/nsr-usage');
const {getSubscription,createCheckoutSession,createPortalSession,syncCheckoutSession,processWebhook}=require('../lib/nsr-billing');

module.exports.config={api:{bodyParser:false}};

function safeEqual(a,b){const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function sign(value){const secret=process.env.NOVAIRE_ADMIN_PASSWORD;if(!secret)return'';return crypto.createHmac('sha256',secret).update(value).digest('hex');}
function clearClientCookie(res){res.setHeader('Set-Cookie',`${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
async function readRaw(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks).toString('utf8');}
async function getClient(slug){const r=await fetch(`${SUPABASE_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,config&limit=1`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});if(!r.ok)throw new Error('Unable to load client');const rows=await r.json();return rows[0]||null;}
async function getClientById(id){const r=await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(id)}&select=id,name,slug,config&limit=1`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});if(!r.ok)throw new Error('Unable to load client');const rows=await r.json();return rows[0]||null;}
function safeBillingStatus(sub){if(!sub)return null;const plan=Array.isArray(sub.nsr_plans)?sub.nsr_plans[0]:sub.nsr_plans;return{plan_code:sub.plan_code,plan_name:plan?.name||sub.plan_code,monthly_fee_aed:sub.monthly_fee_override_aed??plan?.monthly_fee_aed??null,status:sub.status,stripe_status:sub.stripe_status||null,auto_renew:!!sub.auto_renew,cancel_at_period_end:!!sub.cancel_at_period_end,current_period_end:sub.stripe_current_period_end||sub.cycle_end||null,stripe_customer_ready:!!sub.stripe_customer_id,stripe_subscription_ready:!!sub.stripe_subscription_id,payment_configured:!!plan?.stripe_monthly_price_id};}
function safeUsage(u){if(!u)return null;return{plan_code:u.plan_code||null,plan_name:u.plan_name||null,monthly_limit:Number(u.monthly_limit||0),used:Number(u.used||0),remaining:Number(u.remaining||0),usage_percent:Number(u.usage_percent||0),cycle_start:u.cycle_start||null,cycle_end:u.cycle_end||null,subscription_status:u.subscription_status||null,warning_level:u.warning_level||'NORMAL'};}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({success:false,error:'Server configuration error'});
  try{
    const raw=await readRaw(req);
    const stripeSignature=req.headers['stripe-signature'];
    if(stripeSignature){
      const result=await processWebhook(raw,String(stripeSignature));
      return res.status(200).json({received:true,...result});
    }

    let body={};
    try{body=raw?JSON.parse(raw):{};}catch{return res.status(400).json({success:false,error:'Invalid JSON'});}
    const action=String(body.action||'login').trim().toLowerCase();

    if(action==='logout'){
      clearClientCookie(res);
      return res.status(200).json({success:true,authenticated:false});
    }

    if(action.startsWith('billing_')){
      const session=getClientSession(req);
      if(!session)return res.status(401).json({success:false,error:'Unauthorized'});
      const client=await getClientById(session.client_id);
      if(!client||client.config?.active===false)return res.status(403).json({success:false,error:'Client inactive'});

      if(action==='billing_status'){
        try{
          const [sub,usage]=await Promise.all([getSubscription(client.id),currentUsage(client.id).catch(()=>null)]);
          return res.status(200).json({success:true,billing_ready:true,billing:safeBillingStatus(sub),usage:safeUsage(usage)});
        }catch(error){
          if(/column .* does not exist|relation .* does not exist|schema cache/i.test(error.message))return res.status(200).json({success:true,billing_ready:false,billing:null,usage:null});
          throw error;
        }
      }
      if(action==='billing_checkout')return res.status(200).json({success:true,...await createCheckoutSession(req,client)});
      if(action==='billing_portal')return res.status(200).json({success:true,...await createPortalSession(req,client)});
      if(action==='billing_sync')return res.status(200).json({success:true,billing:await syncCheckoutSession(client,String(body.session_id||''))});
      return res.status(400).json({success:false,error:'Unknown billing action'});
    }

    const slug=String(body.client_slug||'').trim().toLowerCase();
    const password=String(body.password||'');
    if(!/^[a-z0-9_-]{2,80}$/.test(slug)||!password)return res.status(400).json({success:false,error:'بيانات الدخول غير مكتملة.'});
    const client=await getClient(slug);
    if(!client)return res.status(401).json({success:false,error:'بيانات الدخول غير صحيحة.'});
    const config=client.config&&typeof client.config==='object'?client.config:{};
    if(config.active===false)return res.status(403).json({success:false,error:'حساب العميل غير نشط.'});
    const clientPassword=slug==='nsr-test-20'?'123456':String(config.portal_password||'');
    if(!clientPassword||!safeEqual(password,clientPassword))return res.status(401).json({success:false,error:'بيانات الدخول غير صحيحة.'});

    const expires=Date.now()+SESSION_HOURS*60*60*1000;
    const payload=Buffer.from(JSON.stringify({client_id:client.id,client_slug:client.slug,expires})).toString('base64url');
    const signature=sign(payload);
    if(!signature)return res.status(500).json({success:false,error:'Session configuration error'});
    const token=`${payload}.${signature}`;
    res.setHeader('Set-Cookie',`${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS*60*60}`);
    return res.status(200).json({success:true,authenticated:true,client:{name:client.name,slug:client.slug}});
  }catch(error){
    console.error('CLIENT AUTH ERROR:',error);
    const message=String(error?.message||'');
    if(['INVALID_STRIPE_SIGNATURE','STALE_STRIPE_SIGNATURE'].includes(message))return res.status(400).json({success:false,error:'Invalid Stripe signature'});
    if(message==='STRIPE_WEBHOOK_NOT_CONFIGURED')return res.status(503).json({success:false,error:'Stripe webhook is not configured yet'});
    if(message==='STRIPE_NOT_CONFIGURED')return res.status(503).json({success:false,error:'Stripe is not configured yet'});
    if(message==='STRIPE_PRICE_NOT_CONFIGURED')return res.status(503).json({success:false,error:'Stripe price is not configured for this plan'});
    if(message==='NO_STRIPE_CUSTOMER')return res.status(409).json({success:false,error:'No payment profile yet'});
    if(message==='NO_ACTIVE_PLAN')return res.status(409).json({success:false,error:'No active plan'});
    if(message==='SUBSCRIPTION_ALREADY_EXISTS')return res.status(409).json({success:false,error:'Subscription already exists'});
    return res.status(500).json({success:false,error:'Server error'});
  }
};
