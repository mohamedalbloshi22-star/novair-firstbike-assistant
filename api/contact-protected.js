const {checkContactRateLimit}=require('../lib/nsr-contact-rate-limit');
const contactHandler=require('./contact');

const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getClientBySlug(slug){
  if(!SUPABASE_URL||!SUPABASE_KEY)throw new Error('CONTACT_RATE_LIMIT_CONFIG_MISSING');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=id,config&limit=1`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
  });
  if(!r.ok)throw new Error(`Unable to load client for contact rate limit: ${r.status}`);
  const rows=await r.json();
  return rows[0]||null;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const body=req.body||{};
  const slug=String(body.client_slug||'').trim().toLowerCase();
  if(!/^[a-z0-9_-]{2,80}$/.test(slug))return res.status(400).json({error:'Valid client_slug is required'});

  try{
    const client=await getClientBySlug(slug);
    if(!client)return res.status(404).json({error:'Client not found'});
    if(client.config?.active===false)return res.status(403).json({error:'Client is inactive'});

    const rate=await checkContactRateLimit(client.id,req);
    if(!rate.allowed){
      if(rate.retry_after_seconds>0)res.setHeader('Retry-After',String(rate.retry_after_seconds));
      return res.status(429).json({
        error:'Too many contact requests. Please try again later.',
        code:'CONTACT_RATE_LIMITED',
        retry_after_seconds:rate.retry_after_seconds
      });
    }

    return contactHandler(req,res);
  }catch(error){
    console.error('CONTACT RATE LIMIT ERROR:',error);
    return res.status(503).json({
      error:'Contact request protection is temporarily unavailable.',
      code:'CONTACT_RATE_LIMIT_UNAVAILABLE'
    });
  }
};
