const { getClientSession } = require('./_client-session');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ success: false, error: 'Server configuration missing' });

  const session = getClientSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const action = String(req.body?.action || '').trim().toLowerCase();
  if (action !== 'delete_all') return res.status(400).json({ success: false, error: 'Unknown action' });
  if (String(req.body?.confirm || '') !== 'DELETE_ALL') return res.status(400).json({ success: false, error: 'Confirmation required' });

  try {
    const conversations = await sb(
      `conversations?client_id=eq.${encodeURIComponent(session.client_id)}&select=id`
    );
    const ids = (Array.isArray(conversations) ? conversations : []).map(x => x.id).filter(Boolean);

    if (!ids.length) return res.status(200).json({ success: true, deleted_conversations: 0 });

    const idList = ids.join(',');

    // Preserve contact-request history while removing its dependency on conversation rows.
    try {
      await sb(`contact_requests?client_id=eq.${encodeURIComponent(session.client_id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { conversation_id: null }
      });
    } catch (error) {
      console.warn('CONTACT REQUEST DETACH WARNING:', error.message);
    }

    await sb(`messages?conversation_id=in.(${idList})`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });

    await sb(`conversations?client_id=eq.${encodeURIComponent(session.client_id)}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });

    return res.status(200).json({ success: true, deleted_conversations: ids.length });
  } catch (error) {
    console.error('CONVERSATION PURGE ERROR:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete stored conversations' });
  }
};
