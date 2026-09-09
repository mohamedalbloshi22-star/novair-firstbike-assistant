const originalChat=require('./chat');
const {getClientBySlug,reserveAiResponse,releaseAiResponse}=require('./_nsr-usage');

function normalizeSlug(value){
  const slug=String(value||'').trim().toLowerCase();
  return /^[a-z0-9_-]{2,80}$/.test(slug)?slug:'';
}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  let client=null;
  let reservation=null;
  let completed=false;
  let released=false;

  async function releaseOnce(){
    if(released||completed||!reservation?.allowed||!client?.id) return;
    released=true;
    try{await releaseAiResponse(client.id);}catch(e){console.error('NSR QUOTA RELEASE ERROR:',e);}
  }

  try{
    const slug=normalizeSlug(req.body?.client_slug);
    if(!slug) return res.status(400).json({error:'Valid client_slug is required'});

    client=await getClientBySlug(slug);
    if(!client) return res.status(404).json({error:'Client not found'});

    reservation=await reserveAiResponse(client.id);

    if(!reservation?.allowed){
      return res.status(429).json({
        error:'MONTHLY_AI_LIMIT_REACHED',
        message_ar:'تم الوصول إلى الحد الشهري للمساعد الذكي. يرجى التواصل مع الجهة أو ترقية الباقة.',
        message_en:'The monthly AI response limit has been reached. Please contact the organisation or upgrade the plan.',
        usage:reservation||null
      });
    }

    const originalWrite=res.write.bind(res);
    const originalEnd=res.end.bind(res);

    res.write=function(chunk,...args){
      try{
        const text=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk||'');
        if(text.includes('"type":"done"')||text.includes('"type": "done"')) completed=true;
      }catch{}
      return originalWrite(chunk,...args);
    };

    res.end=function(...args){
      if(!completed){
        releaseOnce().finally(()=>originalEnd(...args));
        return true;
      }
      return originalEnd(...args);
    };

    return originalChat(req,res);

  }catch(error){
    console.error('NSR CHAT V2 ERROR:',error);
    await releaseOnce();
    if(res.headersSent){try{return res.end();}catch{return;}}
    return res.status(500).json({error:'Unable to process chat request'});
  }
};
