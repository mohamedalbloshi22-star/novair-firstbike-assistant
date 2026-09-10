const crypto=require('crypto');
const originalHandler=require('./client-auth');
const {safeErrorLog,sanitizeErrorMessage}=require('../lib/nsr-safe-log');

const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET=process.env.STRIPE_WEBHOOK_SECRET;
const MAX_CLIENT_AUTH_BODY_BYTES=32*1024;
const MAX_STRIPE_WEBHOOK_BODY_BYTES=1024*1024;

module.exports.config={api:{bodyParser:false}};

async function readRaw(req,maxBytes){
  const chunks=[];
  let total=0;
  for await(const chunk of req){
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    total+=buffer.length;
    if(total>maxBytes)throw new Error('REQUEST_BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifyWebhook(rawBody,signatureHeader){
  if(!STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_WEBHOOK_NOT_CONFIGURED');
  const parts=String(signatureHeader||'').split(',').map(x=>x.trim());
  const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);
  const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!timestamp||!signatures.length)throw new Error('INVALID_STRIPE_SIGNATURE');
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Math.floor(Date.now()/1000)-ts)>300)throw new Error('STALE_STRIPE_SIGNATURE');
  const expected=crypto.createHmac('sha256',STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuf=Buffer.from(expected);
  const valid=signatures.some(sig=>{const sigBuf=Buffer.from(sig);return sigBuf.length===expectedBuf.length&&crypto.timingSafeEqual(sigBuf,expectedBuf);});
  if(!valid)throw new Error('INVALID_STRIPE_SIGNATURE');
}

async function rpc(name,body){
  if(!SUPABASE_URL||!SUPABASE_KEY)throw new Error('BILLING_IDEMPOTENCY_CONFIG_MISSING');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text=await r.text();
  if(!r.ok)throw new Error(`Supabase billing idempotency RPC ${r.status}: ${text}`);
  const data=text?JSON.parse(text):null;
  return Array.isArray(data)?data[0]||null:data;
}

function replayRawBody(req,raw){
  let sent=false;
  req[Symbol.asyncIterator]=async function*(){if(sent)return;sent=true;yield Buffer.from(raw);};
}

function installClientLoginResponseFilter(res){
  const originalJson=res.json.bind(res);
  res.json=function filteredJson(payload){
    if(res.statusCode===403&&payload?.error==='حساب العميل غير نشط.'){
      res.statusCode=401;
      return originalJson({success:false,error:'بيانات الدخول غير صحيحة.'});
    }
    return originalJson(payload);
  };
}

module.exports=async function handler(req,res){
  const signature=req.headers['stripe-signature'];
  if(!signature){
    installClientLoginResponseFilter(res);
    if(req.method!=='POST')return originalHandler(req,res);
    try{
      const raw=await readRaw(req,MAX_CLIENT_AUTH_BODY_BYTES);
      replayRawBody(req,raw);
      return originalHandler(req,res);
    }catch(error){
      if(String(error?.message||'')==='REQUEST_BODY_TOO_LARGE')return res.status(413).json({success:false,error:'Request body is too large'});
      safeErrorLog('CLIENT_AUTH_PROTECTION_ERROR',error);
      return res.status(503).json({success:false,error:'Client authentication protection temporarily unavailable'});
    }
  }

  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});

  let eventId=null;
  try{
    const raw=await readRaw(req,MAX_STRIPE_WEBHOOK_BODY_BYTES);
    verifyWebhook(raw,String(signature));
    const event=JSON.parse(raw);
    eventId=String(event?.id||'').trim();
    if(!/^evt_[A-Za-z0-9_]+$/.test(eventId))return res.status(400).json({success:false,error:'Invalid Stripe event id'});

    const claim=await rpc('nsr_claim_billing_event',{p_event_id:eventId});
    if(claim?.claimed!==true){
      return res.status(200).json({received:true,duplicate:true,event_id:eventId});
    }

    replayRawBody(req,raw);
    await originalHandler(req,res);

    const success=res.statusCode>=200&&res.statusCode<300;
    await rpc('nsr_finish_billing_event',{p_event_id:eventId,p_success:success,p_error:success?null:`HTTP ${res.statusCode}`});
    return;
  }catch(error){
    safeErrorLog('STRIPE_IDEMPOTENCY_WRAPPER_ERROR',error,eventId?{event_id:eventId}:{});
    if(eventId){try{await rpc('nsr_finish_billing_event',{p_event_id:eventId,p_success:false,p_error:sanitizeErrorMessage(error)});}catch{}}
    const message=String(error?.message||'');
    if(message==='REQUEST_BODY_TOO_LARGE')return res.status(413).json({success:false,error:'Stripe webhook body is too large'});
    if(['INVALID_STRIPE_SIGNATURE','STALE_STRIPE_SIGNATURE'].includes(message))return res.status(400).json({success:false,error:'Invalid Stripe signature'});
    if(message==='STRIPE_WEBHOOK_NOT_CONFIGURED')return res.status(503).json({success:false,error:'Stripe webhook is not configured yet'});
    return res.status(503).json({success:false,error:'Billing webhook protection temporarily unavailable'});
  }
};
