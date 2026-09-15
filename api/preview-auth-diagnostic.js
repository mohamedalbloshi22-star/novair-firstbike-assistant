module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false});
  const url=String(process.env.SUPABASE_URL||'').trim();
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const host=(()=>{try{return new URL(url).hostname}catch{return null}})();
  if(!url||!key)return res.status(200).json({ok:false,host,configured:false});
  try{
    const r=await fetch(`${url}/rest/v1/clients?slug=eq.nsr-test-20&select=slug,config&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
    const rows=await r.json();
    const row=Array.isArray(rows)?rows[0]:null;
    const cfg=row?.config&&typeof row.config==='object'?row.config:{};
    return res.status(200).json({ok:r.ok,host,configured:true,client_found:!!row,client_active:cfg.active!==false,has_hash:!!cfg.portal_password_hash,has_salt:!!cfg.portal_password_salt,has_legacy_password:!!cfg.portal_password});
  }catch(e){return res.status(200).json({ok:false,host,configured:true,error:'diagnostic_failed'});}
};
