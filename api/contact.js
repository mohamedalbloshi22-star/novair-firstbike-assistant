const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_EMAIL = process.env.NOVAIRE_NOTIFICATION_EMAIL;
const NOTIFICATION_FROM = process.env.NOVAIRE_NOTIFICATION_FROM || "NOVAIRE <onboarding@resend.dev>";
const { safeErrorLog } = require('../lib/nsr-safe-log');

const MAX_SESSION_ID = 180;
const MAX_NAME = 120;
const MAX_PHONE = 40;
const MAX_REASON = 600;

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase environment variables are missing");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function cleanText(value) { return typeof value === "string" ? value.trim() : ""; }
function normalizeSlug(value) {
  const slug = cleanText(value).toLowerCase();
  return /^[a-z0-9_-]{2,80}$/.test(slug) ? slug : "";
}
function validSessionId(value) {
  const s = cleanText(value);
  return s.length >= 8 && s.length <= MAX_SESSION_ID && /^[A-Za-z0-9._:-]+$/.test(s) ? s : "";
}
function validPhone(value) {
  const p = cleanText(value);
  return p.length >= 5 && p.length <= MAX_PHONE && /^[0-9+()\-\s.]+$/.test(p) ? p : "";
}
function escapeHtml(value) {
  return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function formatRequestType(type) {
  return type === "human_handoff" ? "تحويل إلى موظف" : type === "callback" ? "طلب معاودة اتصال" : type;
}

async function getClient(slug) {
  const rows = await supabaseRequest(`clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,config&limit=1`);
  const client = Array.isArray(rows) ? rows[0] : null;
  if (!client?.id) return null;
  if (client.config?.active === false) return { ...client, inactive: true };
  return client;
}

async function getOrCreateConversation(clientId, sessionId, language) {
  const safeLanguage = language === "en" ? "en" : "ar";
  const existing = await supabaseRequest(`conversations?client_id=eq.${encodeURIComponent(clientId)}&session_id=eq.${encodeURIComponent(sessionId)}&select=id,client_id,session_id,resolved_by_ai,human_handoff,callback_requested,language&limit=1`);
  if (Array.isArray(existing) && existing.length) {
    const conversation = existing[0];
    if (conversation.language !== safeLanguage) {
      await supabaseRequest(`conversations?id=eq.${encodeURIComponent(conversation.id)}`, {
        method:"PATCH",
        prefer:"return=minimal",
        body:{ language:safeLanguage }
      });
      conversation.language = safeLanguage;
    }
    return conversation;
  }

  try {
    const created = await supabaseRequest("conversations", {
      method:"POST",
      prefer:"return=representation",
      body:{
        client_id:clientId,
        session_id:sessionId,
        status:"open",
        resolved_by_ai:null,
        human_handoff:false,
        callback_requested:false,
        language:safeLanguage
      }
    });
    if (Array.isArray(created) && created[0]?.id) return created[0];
  } catch (error) {
    const retry = await supabaseRequest(`conversations?client_id=eq.${encodeURIComponent(clientId)}&session_id=eq.${encodeURIComponent(sessionId)}&select=id,client_id,session_id,resolved_by_ai,human_handoff,callback_requested,language&limit=1`);
    if (Array.isArray(retry) && retry[0]?.id) return retry[0];
    throw error;
  }
  throw new Error("Unable to create conversation");
}

async function createContactRequest(clientId, conversationId, requestType, customerName, phone, reason) {
  const rows = await supabaseRequest("contact_requests", {
    method:"POST",
    prefer:"return=representation",
    body:{
      client_id:clientId,
      conversation_id:conversationId,
      request_type:requestType,
      customer_name:customerName,
      phone,
      reason:reason || null,
      status:"new"
    }
  });
  if (!Array.isArray(rows) || !rows[0]?.id) throw new Error("Contact request was not saved");
  return rows[0];
}

async function sendNotification({ client, requestType, customerName, phone, reason, conversationId }) {
  if (!RESEND_API_KEY || !NOTIFICATION_EMAIL) return { sent:false, skipped:true };
  const typeText = formatRequestType(requestType);
  const clientName = client?.config?.brand_name || client?.name || client?.slug || "Client";
  const subject = `NOVAIRE | ${typeText} جديد — ${clientName}`;
  const html = `<div dir="rtl" style="font-family:Arial,Tahoma,sans-serif;max-width:650px;margin:auto;color:#111827;line-height:1.8"><h2>NOVAIRE Smart Response</h2><p>تم تسجيل طلب جديد من مساعد <strong>${escapeHtml(clientName)}</strong>.</p><table style="width:100%;border-collapse:collapse"><tr><td><b>نوع الطلب</b></td><td>${escapeHtml(typeText)}</td></tr><tr><td><b>الاسم</b></td><td>${escapeHtml(customerName)}</td></tr><tr><td><b>الهاتف</b></td><td>${escapeHtml(phone)}</td></tr><tr><td><b>السبب</b></td><td>${escapeHtml(reason || "غير محدد")}</td></tr><tr><td><b>Conversation ID</b></td><td>${escapeHtml(conversationId)}</td></tr></table><p style="font-size:12px;color:#6b7280">إشعار تلقائي من NOVAIRE Smart Response.</p></div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, "Content-Type":"application/json" },
    body:JSON.stringify({ from:NOTIFICATION_FROM, to:[NOTIFICATION_EMAIL], subject, html })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Email notification failed ${response.status}: ${text}`);
  return { sent:true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"Method not allowed" });
  try {
    const body = req.body || {};
    const clientSlug = normalizeSlug(body.client_slug);
    const sessionId = validSessionId(body.session_id);
    const requestType = cleanText(body.request_type);
    const customerName = cleanText(body.customer_name);
    const phone = validPhone(body.phone);
    const reason = cleanText(body.reason);
    const language = cleanText(body.language).toLowerCase() === "en" ? "en" : "ar";

    if (!clientSlug) return res.status(400).json({ error:"Valid client_slug is required" });
    if (!sessionId) return res.status(400).json({ error:"Invalid session_id" });
    if (requestType !== "human_handoff" && requestType !== "callback") return res.status(400).json({ error:"Invalid request_type" });
    if (!customerName || customerName.length > MAX_NAME) return res.status(400).json({ error:"Invalid customer name" });
    if (!phone) return res.status(400).json({ error:"Invalid phone" });
    if (reason.length > MAX_REASON) return res.status(400).json({ error:"Reason is too long" });

    const client = await getClient(clientSlug);
    if (!client) return res.status(404).json({ error:"Client not found" });
    if (client.inactive) return res.status(403).json({ error:"Client is inactive" });

    const conversation = await getOrCreateConversation(client.id, sessionId, language);
    const contactRequest = await createContactRequest(client.id, conversation.id, requestType, customerName, phone, reason);

    const updateField = requestType === "human_handoff" ? "human_handoff" : "callback_requested";
    await supabaseRequest(`conversations?id=eq.${encodeURIComponent(conversation.id)}&client_id=eq.${encodeURIComponent(client.id)}`, {
      method:"PATCH",
      prefer:"return=minimal",
      body:{ [updateField]:true, resolved_by_ai:false }
    });

    let notification = { sent:false };
    try { notification = await sendNotification({ client, requestType, customerName, phone, reason, conversationId:conversation.id }); }
    catch (error) { safeErrorLog("CONTACT_NOTIFICATION_ERROR", error, { client_slug: clientSlug, request_type: requestType }); }

    return res.status(200).json({
      success:true,
      request_id:contactRequest.id,
      client:{ id:client.id, name:client.name, slug:client.slug },
      request_type:requestType,
      conversation_id:conversation.id,
      notification_sent:notification.sent === true
    });
  } catch (error) {
    safeErrorLog("CONTACT_API_ERROR", error);
    return res.status(500).json({ error:"Internal server error", code:"CONTACT_REQUEST_FAILED" });
  }
};
