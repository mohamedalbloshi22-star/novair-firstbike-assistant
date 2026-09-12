const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_FROM = process.env.NOVAIRE_NOTIFICATION_FROM || 'BASEERA <onboarding@resend.dev>';
const { sanitizeErrorMessage } = require('./nsr-safe-log');

function clean(v){ return String(v || '').trim(); }
function esc(v){ return String(v || '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

async function sb(path, options={}){
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase configuration');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json',
      ...(options.prefer ? {Prefer:options.prefer} : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const t = await r.text();
  if(!r.ok){
    const e = new Error(`Supabase ${r.status}: ${t}`);
    e.status = r.status;
    e.body = t;
    throw e;
  }
  return t ? JSON.parse(t) : [];
}

async function getClient(clientId){
  const rows = await sb(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,name,slug,config&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function targetEmail(client){
  const cfg = client?.config && typeof client.config === 'object' ? client.config : {};
  return clean(cfg.billing_email) || clean(cfg.contact_email);
}

async function notificationLogReady(clientId){
  try{
    await sb(`nsr_notification_log?client_id=eq.${encodeURIComponent(clientId)}&select=id&limit=1`);
    return true;
  }catch(e){
    if(e.status === 404 || /nsr_notification_log|42P01/i.test(e.body || e.message)) return false;
    throw e;
  }
}

async function alreadySent(clientId, cycleStart, type, recipient){
  const rows = await sb(`nsr_notification_log?client_id=eq.${encodeURIComponent(clientId)}&cycle_start=eq.${encodeURIComponent(cycleStart)}&notification_type=eq.${encodeURIComponent(type)}&recipient=eq.${encodeURIComponent(recipient)}&select=id,status&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function logNotification({clientId,cycleStart,type,recipient,subject,status,providerMessageId,metadata}){
  await sb('nsr_notification_log',{
    method:'POST',
    prefer:'return=minimal',
    body:{
      client_id:clientId,
      cycle_start:cycleStart || null,
      notification_type:type,
      recipient,
      subject,
      status,
      provider_message_id:providerMessageId || null,
      metadata:metadata || {}
    }
  });
}

async function sendEmail(to, subject, html){
  if(!RESEND_API_KEY) return {skipped:true};
  const r = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:NOTIFICATION_FROM,to:[to],subject,html})
  });
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d?.message || `Resend ${r.status}`);
  return {sent:true,id:d?.id || null};
}

async function notifyUsageThreshold(clientId, usage){
  const threshold = Number(usage?.newly_crossed_threshold || 0);
  if(![70,85,95,100].includes(threshold)) return {skipped:true,reason:'not-notifiable-threshold'};
  if(!usage?.cycle_start) return {skipped:true,reason:'missing-cycle'};
  if(!await notificationLogReady(clientId)) return {skipped:true,reason:'v6-not-installed'};

  const client = await getClient(clientId);
  if(!client) return {skipped:true,reason:'client-not-found'};
  const recipient = targetEmail(client);
  if(!recipient) return {skipped:true,reason:'no-client-email'};

  const type = `usage_${threshold}`;
  if(await alreadySent(clientId, usage.cycle_start, type, recipient)) return {skipped:true,reason:'already-sent'};
  if(!RESEND_API_KEY) return {skipped:true,reason:'email-not-configured'};

  const cfg = client.config && typeof client.config === 'object' ? client.config : {};
  const name = clean(cfg.brand_name) || client.name || client.slug;
  const used = Number(usage.used || 0).toLocaleString();
  const limit = Number(usage.monthly_limit || 0).toLocaleString();
  const remaining = Number(usage.remaining || 0).toLocaleString();
  const subject = `BASEERA | BSR-1 | تنبيه استخدام ${threshold}% — ${name}`;
  const html = `<div dir="rtl" style="font-family:Arial,Tahoma,sans-serif;line-height:1.8;color:#111827;max-width:680px;margin:auto"><h2>BSR-1 | BASEERA Smart Response</h2><p>مرحبًا،</p><p>وصل استخدام المساعد الخاص بـ <b>${esc(name)}</b> إلى <b>${threshold}%</b> من الحد الشهري.</p><p>المستخدم: <b>${esc(used)}</b><br>الحد الشهري: <b>${esc(limit)}</b><br>المتبقي: <b>${esc(remaining)}</b></p>${threshold===100?'<p><b>تم الوصول إلى الحد الشهري، وقد تتوقف ردود الذكاء الاصطناعي حتى التجديد أو ترقية الباقة.</b></p>':''}<p style="font-size:12px;color:#6b7280">إشعار آلي من BASEERA Digital Solutions.</p></div>`;

  try{
    const sent = await sendEmail(recipient,subject,html);
    await logNotification({clientId,cycleStart:usage.cycle_start,type,recipient,subject,status:'sent',providerMessageId:sent.id,metadata:{threshold,used:usage.used,monthly_limit:usage.monthly_limit,remaining:usage.remaining}});
    return {sent:true};
  }catch(error){
    try{ await logNotification({clientId,cycleStart:usage.cycle_start,type,recipient,subject,status:'failed',metadata:{threshold,error:sanitizeErrorMessage(error)}}); }catch{}
    throw error;
  }
}

module.exports = { notifyUsageThreshold };
