const {getClientBySlug,currentUsage}=require('./_nsr-usage');

function safeSlug(value){
  const slug=String(value||'').trim().toLowerCase();
  return /^[a-z0-9_-]{2,80}$/.test(slug)?slug:'';
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  try{
    const slug=safeSlug(req.method==='GET'?req.query?.client:req.body?.client_slug);
    if(!slug) return res.status(400).json({error:'Valid client is required'});
    const client=await getClientBySlug(slug);
    if(!client) return res.status(404).json({error:'Client not found'});
    const usage=await currentUsage(client.id);
    if(!usage) return res.status(404).json({error:'Package not assigned'});
    return res.status(200).json({success:true,client:{id:client.id,name:client.name,slug:client.slug},usage});
  }catch(error){
    console.error('USAGE API ERROR:',error);
    return res.status(500).json({error:'Unable to load package usage'});
  }
};
