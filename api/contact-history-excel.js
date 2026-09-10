const XLSX = require('xlsx');
const { getClientSession } = require('./_client-session');
const { safeErrorLog } = require('../lib/nsr-safe-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase configuration is missing');
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

function statusLabel(status) {
  return ({ completed: 'مكتمل', closed: 'مغلق' })[status] || status || '';
}

function typeLabel(type) {
  if (type === 'callback') return 'طلب اتصال';
  if (type === 'human_handoff') return 'التحدث مع مسؤول';
  return type || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = getClientSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await supabaseRequest(
      `contact_requests?client_id=eq.${encodeURIComponent(session.client_id)}` +
      `&status=in.(completed,closed)` +
      `&select=id,request_type,customer_name,phone,reason,status,created_at` +
      `&order=created_at.desc`
    );

    const data = (Array.isArray(rows) ? rows : []).map((x, i) => ({
      '#': i + 1,
      'الاسم': excelSafe(x.customer_name),
      'الهاتف': excelSafe(x.phone),
      'نوع الطلب': excelSafe(typeLabel(x.request_type)),
      'السبب': excelSafe(x.reason),
      'الحالة': excelSafe(statusLabel(x.status)),
      'تاريخ الطلب': excelSafe(x.created_at ? new Date(x.created_at).toISOString() : '')
    }));

    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'السجل': 'لا توجد طلبات مكتملة أو مغلقة' }]);
    ws['!cols'] = [
      { wch: 6 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 36 }, { wch: 14 }, { wch: 24 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل طلبات التواصل');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="NSR1-contact-history-${date}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    safeErrorLog('CONTACT_HISTORY_EXCEL_ERROR', error);
    return res.status(500).json({ error: 'Unable to export contact history' });
  }
};
