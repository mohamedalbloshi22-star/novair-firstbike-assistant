const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {getClientSession}=require('./_client-session');
const {safeErrorLog}=require('../lib/nsr-safe-log');

async function db(path,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method:options.method||'GET',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',Prefer:options.prefer||'return=representation'},
    body:options.body?JSON.stringify(options.body):undefined
  });
  const text=await r.text();
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${text}`);
  return text?JSON.parse(text):[];
}
function clean(v){return String(v||'').trim();}
function norm(v){return clean(v).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
const FAQ=[
  {k:['الحد الشهري','نفدت الباقة','انتهت الباقة','الردود'],a:'حد الباقة هو عدد ردود الذكاء الاصطناعي المتاحة خلال دورة الاشتراك. عند بلوغ الحد يمكنك الانتظار حتى التجديد أو بدء دورة جديدة فورًا من صفحة إدارة الباقة.'},
  {k:['التجديد التلقائي','تجديد الاشتراك','خصم تلقائي'],a:'عند تفعيل الدفع الإلكتروني يتجدد الاشتراك شهريًا تلقائيًا من وسيلة الدفع المسجلة لدى مزود الدفع، ويمكنك إدارة التجديد من صفحة إدارة الباقة.'},
  {k:['الغاء الاشتراك','إلغاء الاشتراك','الغاء التجديد','إلغاء التجديد'],a:'إلغاء التجديد لا يوقف الخدمة فورًا. تستمر الخدمة حتى نهاية الدورة المدفوعة أو نفاد حد الباقة، ثم يتوقف المساعد وتبقى لوحة العميل متاحة لإعادة الاشتراك لاحقًا.'},
  {k:['بداية دورة جديدة','باقة جديدة','دورة جديدة'],a:'إذا انتهى حد الردود قبل نهاية الدورة يمكنك بدء دورة شهرية جديدة فورًا. عند نجاح الدفع يصبح تاريخ الدفع الجديد بداية الدورة وموعد التجديد التالي.'},
  {k:['لوحة العميل','لوحة التحكم','البوابة'],a:'لوحة العميل تعرض حالة الباقة والاستخدام والإحصائيات وطلبات التواصل وسجل المحادثات وإدارة الاشتراك.'},
  {k:['حذف المحادثات','المحادثات المخزنة'],a:'يمكنك تنزيل سجل المحادثات بصيغة Excel، ويوجد خيار لحذف جميع المحادثات المخزنة بعد تأكيد العملية.'},
  {k:['اسئلة غير مجابة','الأسئلة غير المجابة'],a:'تظهر الأسئلة التي لم يجد المساعد لها إجابة موثوقة في لوحة العميل. بعد اعتماد الإجابة الصحيحة تختفي من القائمة وتضاف إلى معرفة المساعد.'},
  {k:['طلب اتصال','التواصل','التحدث مع مسؤول'],a:'يمكنك تسجيل طلب تواصل من المساعد أو من لوحة العميل. الطلبات الجديدة وقيد التنفيذ تظهر في اللوحة حتى يتم إكمالها أو إغلاقها.'},
  {k:['الدفع','البطاقة','الفاتورة'],a:'بيانات البطاقة لا تُخزن داخل BASEERA، بل يعالجها مزود الدفع المعتمد. عند تفعيل الدفع يمكن إدارة البطاقة والفواتير والتجديد من صفحة إدارة الباقة.'},
  {k:['اللغة','العربي','الانجليزي','الإنجليزي'],a:'يدعم BSR-1 العربية والإنجليزية وفق إعدادات العميل والمعرفة المضافة للمساعد.'}
];
function answerFor(message){const q=norm(message);for(const item of FAQ){if(item.k.some(k=>q.includes(norm(k))))return item.a;}return '';}
async function getClient(id){const rows=await db(`clients?id=eq.${encodeURIComponent(id)}&select=id,name,slug,config&limit=1`);return Array.isArray(rows)?rows[0]||null:null;}
async function saveRequest(clientId,message,autoAnswer=''){
  const resolved=!!autoAnswer;
  const rows=await db('nsr_support_requests',{method:'POST',body:{client_id:clientId,message,auto_answer:autoAnswer||null,admin_reply:null,status:resolved?'resolved_auto':'pending'}});
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row?.id)throw new Error('Unable to save support request');
  return row;
}
async function listRequests(clientId){
  const rows=await db(`nsr_support_requests?client_id=eq.${encodeURIComponent(clientId)}&select=id,message,auto_answer,admin_reply,status,created_at,replied_at&order=created_at.desc&limit=50`);
  return Array.isArray(rows)?rows:[];
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!SUPABASE_URL||!SUPABASE_KEY)return res.status(500).json({success:false,error:'Server configuration error'});
  const session=getClientSession(req);
  if(!session)return res.status(401).json({success:false,error:'Unauthorized'});
  try{
    const client=await getClient(session.client_id);
    if(!client)return res.status(404).json({success:false,error:'Client not found'});
    if(client.config?.active===false)return res.status(403).json({success:false,error:'Client inactive'});
    if(req.method==='GET')return res.status(200).json({success:true,requests:await listRequests(client.id)});
    if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
    const message=clean(req.body?.message);
    if(message.length<2||message.length>800)return res.status(400).json({success:false,error:'اكتب استفسارًا قصيرًا وواضحًا.'});
    const answer=answerFor(message);
    const request=await saveRequest(client.id,message,answer);
    if(answer)return res.status(200).json({success:true,resolved:true,request_id:request.id,answer});
    return res.status(200).json({success:true,resolved:false,escalated:true,request_id:request.id,answer:'لم أجد إجابة موثوقة لهذا الاستفسار. تم تحويل رسالتك إلى إدارة BASEERA، وسيظهر الرد هنا عند اعتماده.'});
  }catch(error){safeErrorLog('SUPPORT_CLIENT_ERROR',error);return res.status(500).json({success:false,error:'تعذر تنفيذ طلب الدعم.'});}
};