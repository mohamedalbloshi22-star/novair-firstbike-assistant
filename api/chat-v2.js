const originalChat=require('./chat');
const {getClientBySlug,checkQuota,recordAiResponse}=require('./_nsr-usage');

function normalizeSlug(value){
  const slug=String(value||'').trim().toLowerCase();
  return /^[a-z0-9_-]{2,80}$/.test(slug)?slug:'';
}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try{
    const slug=normalizeSlug(req.body?.client_slug);
    if(!slug) return res.status(400).json({error:'Valid client_slug is required'});

    const client=await getClientBySlug(slug);
    if(!client) return res.status(404).json({error:'Client not found'});

    const quota=await checkQuota(client.id);
    if(!quota?.allowed){
      return res.status(429).json({
        error:'MONTHLY_AI_LIMIT_REACHED',
        message_ar:'تم الوصول إلى الحد الشهري للمساعد الذكي. يرجى التواصل مع الجهة أو ترقية الباقة.',
        message_en:'The monthly AI response limit has been reached. Please contact the organisation or upgrade the plan.',
        usage:quota||null
      });
    }

    let recorded=false;
    const originalEnd=res.end.bind(res);
    res.end=async function(...args){
      if(!recorded && res.statusCode>=200 && res.statusCode<300){
        recorded=true;
        try{ await recordAiResponse(client.id); }catch(e){ console.error('NSR USAGE RECORD ERROR:',e); }
      }
      return originalEnd(...args);
    };

    return originalChat(req,res);
  }catch(error){
    console.error('NSR CHAT V2 ERROR:',error);
    if(res.headersSent){ try{return res.end();}catch{} }
    return res.status(500).json({error:'Unable to process chat request'});
  }
};
