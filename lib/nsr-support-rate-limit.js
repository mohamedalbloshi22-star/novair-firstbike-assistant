const crypto=require('crypto');

const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_REQUESTS=20;
const WINDOW_SECONDS=60*60;
const BLOCK_SECONDS=15*60;

function clientIp(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return forwarded||String(req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown').trim()||'unknown';
}

function rateKey(clientId,req){
  const raw=`support:${String(clientId||'').trim()}:${clientIp(req)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function checkSupportRateLimit(clientId,req){
  if(!SUPABASE_URL||!SUPABASE_KEY)throw new Error('RATE_LIMIT_CONFIG_MISSING');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/nsr_check_chat_rate_limit`,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      p_key:rateKey(clientId,req),
      p_max_requests:MAX_REQUESTS,
      p_window_seconds:WINDOW_SECONDS,
      p_block_seconds:BLOCK_SECONDS
    })
  });
  const text=await r.text();
  if(!r.ok)throw new Error(`Supabase support rate limit RPC ${r.status}: ${text}`);
  const data=text?JSON.parse(text):null;
  const state=Array.isArray(data)?data[0]||null:data;
  return {
    allowed:state?.allowed===true,
    request_count:Number(state?.request_count||0),
    remaining:Number(state?.remaining||0),
    retry_after_seconds:Math.max(0,Number(state?.retry_after_seconds||0))
  };
}

module.exports={checkSupportRateLimit};
