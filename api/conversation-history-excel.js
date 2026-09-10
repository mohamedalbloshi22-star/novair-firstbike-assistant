const ExcelJS = require('exceljs');
const { getClientSession } = require('./_client-session');
const { excelSafe } = require('../lib/excel-safe');

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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Server configuration missing' });

  const session = getClientSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const conversations = await sb(
      `conversations?client_id=eq.${encodeURIComponent(session.client_id)}` +
      `&select=id,started_at,created_at,language,resolved_by_ai,human_handoff,callback_requested` +
      `&order=created_at.desc`
    );

    const ids = (Array.isArray(conversations) ? conversations : []).map(x => x.id).filter(Boolean);
    let messages = [];
    if (ids.length) {
      messages = await sb(
        `messages?conversation_id=in.(${ids.map(encodeURIComponent).join(',')})` +
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

    const workbook = new ExcelJS.Workbook();
    const addSheet = (name, rows, emptyMessage, widths) => {
      const worksheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true }] });
      const exportRows = rows.length ? rows : [{ 'السجل': emptyMessage }];
      const headers = Object.keys(exportRows[0]);
      worksheet.columns = headers.map((header, index) => ({
        header,
        key: header,
        width: widths[index] || 24
      }));
      exportRows.forEach(row => worksheet.addRow(row));
      worksheet.getRow(1).font = { bold: true };
      worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(headers.length).letter}1` };
    };

    addSheet('المحادثات', convRows, 'لا توجد محادثات', [6, 38, 24, 12, 24, 18, 16]);
    addSheet('الرسائل', msgRows, 'لا توجد رسائل', [6, 38, 18, 80, 24]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="NSR1-conversations-${session.client_slug}-${date}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('CONVERSATION HISTORY EXCEL ERROR:', error);
    return res.status(500).json({ error: 'Unable to export conversation history' });
  }
};
