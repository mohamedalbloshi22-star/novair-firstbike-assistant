const { processWebhook } = require('../lib/nsr-billing');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.NOVAIRE_NOTIFICATION_FROM || 'NOVAIRE <onboarding@resend.dev>';

async function readRaw(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : [];
}

function clean(v) { return String(v || '').trim(); }
function esc(v) {
  return String(v || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return { skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.message || 'Email send failed');
  return { sent: true, id: d?.id || null };
}

async function emailPaidInvoice(clientId, invoice) {
  if (!clientId || !invoice) return;
  const rows = await sb(`clients?id=eq.${encodeURIComponent(clientId)}&select=name,slug,config&limit=1`);
  const client = Array.isArray(rows) ? rows[0] : null;
  if (!client) return;
  const cfg = client.config && typeof client.config === 'object' ? client.config : {};
  const to = clean(cfg.billing_email) || clean(cfg.contact_email);
  if (!to) return;
  const name = clean(cfg.brand_name) || client.name || client.slug;
  const amount = Number(invoice.amount_paid || 0) / 100;
  const currency = String(invoice.currency || 'aed').toUpperCase();
  const number = clean(invoice.number) || clean(invoice.id);
  const invoiceUrl = clean(invoice.hosted_invoice_url);
  const pdfUrl = clean(invoice.invoice_pdf);
  const links = [
    invoiceUrl ? `<p><a href="${esc(invoiceUrl)}">عرض الفاتورة</a></p>` : '',
    pdfUrl ? `<p><a href="${esc(pdfUrl)}">تحميل نسخة PDF من الفاتورة</a></p>` : ''
  ].join('');
  const subject = `NOVAIRE | تم استلام الدفعة — ${name}`;
  const html = `<div dir="rtl" style="font-family:Arial,Tahoma,sans-serif;line-height:1.8;color:#111827;max-width:680px;margin:auto"><h2>NOVAIRE Smart Response</h2><p>تم استلام دفعة اشتراك <b>${esc(name)}</b> بنجاح.</p><p>رقم الفاتورة: <b>${esc(number)}</b></p><p>المبلغ المدفوع: <b>${amount.toLocaleString()} ${esc(currency)}</b></p>${links}<p style="font-size:12px;color:#6b7280">هذه رسالة فوترة آلية من NOVAIRE.</p></div>`;
  await sendEmail(to, subject, html);
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const raw = await readRaw(req);
    const signature = String(req.headers['stripe-signature'] || '');
    const result = await processWebhook(raw, signature);
    try {
      const event = JSON.parse(raw);
      if (event?.type === 'invoice.paid' && result?.client_id) {
        await emailPaidInvoice(result.client_id, event?.data?.object || {});
      }
    } catch (mailError) {
      console.error('INVOICE EMAIL ERROR:', mailError);
    }
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error('STRIPE WEBHOOK ERROR:', error);
    return res.status(400).json({ error: 'Webhook processing failed' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
