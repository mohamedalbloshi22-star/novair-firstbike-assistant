const XLSX = require('xlsx');
const { getClientSession } = require('./_client-session');
const { safeErrorLog } = require('../lib/nsr-safe-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

function excelSafe(value) {
  const text = String(value ?? '');
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Server configuration missing' });

  const session = getClientSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const clients = await sb(`clients?id=eq.${encodeURIComponent(session.client_id)}&select=id,config&limit=1`);
    const client = Array.isArray(clients) ? clients[0] || null : null;
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.config?.active === false) return res.status(403).json({ error: 'Client inactive' });

    const conversations = await sb(
      `conversations?client_id=eq.${encodeURIComponent(session.client_id)}` +
      `&select=id,started_at,created_at,language,resolved_by_ai,human_handoff,callback_requested` +
      `&order=created_at.desc`
    );

    const ids = (Array.isArray(conversations) ? conversations : []).map(x => x.id).filter(Boolean);
    let messages = [];
    if (ids.length) {
      messages = await sb(
        `messages?conversation_id=in.(${ids.join(',')})` +
        `&select=id,conversation_id,sender,content,created_at` +
        `&order=created_at.asc`
      );
    }

    const convRows = (Array.isArray(conversations) ? conversations : []).map((x, i) => ({
      '#': i + 1,
      'معرف المحادثة': excelSafe(x.id),
      'بداية المحادثة': excelSafe(x.started_at || x.created_at || ''),
      'اللغة': excelSafe(x.language),
      'تم الحل بالذكاء الاصطناعي': x.resolved_by_ai === true ? 'نعم' : 'لا',
      'تحويل لموظف': x.human_handoff === true ? 'نعم' : 'لا',
      'طلب اتصال': x.callback_requested === true ? 'نعم' : 'لا'
    }));

    const msgRows = (Array.isArray(messages) ? messages : []).map((x, i) => ({
      '#': i + 1,
      'معرف المحادثة': excelSafe(x.conversation_id),
      'المرسل': excelSafe(x.sender === 'user' ? 'العميل/الزائر' : x.sender === 'assistant' ? 'المساعد' : (x.sender || '')),
      'الرسالة': excelSafe(x.content),
      'التاريخ والوقت': excelSafe(x.created_at)
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(convRows.length ? convRows : [{ 'السجل': 'لا توجد محادثات' }]);
    const ws2 = XLSX.utils.json_to_sheet(msgRows.length ? msgRows : [{ 'السجل': 'لا توجد رسائل' }]);
    ws1['!cols'] = [{wch:6},{wch:38},{wch:24},{wch:12},{wch:24},{wch:18},{wch:16}];
    ws2['!cols'] = [{wch:6},{wch:38},{wch:18},{wch:80},{wch:24}];
    XLSX.utils.book_append_sheet(wb, ws1, 'المحادثات');
    XLSX.utils.book_append_sheet(wb, ws2, 'الرسائل');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="NSR1-conversations-${session.client_slug}-${date}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    safeErrorLog('CONVERSATION_HISTORY_EXCEL_ERROR', error);
    return res.status(500).json({ error: 'Unable to export conversation history' });
  }
};
