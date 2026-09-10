const { getClientSession } = require('./_client-session');
const supportClientHandler = require('./support-client');
const { safeErrorLog } = require('../lib/nsr-safe-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getClient(clientId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,config&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ success: false, error: 'Server configuration error' });

  const session = getClientSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const client = await getClient(session.client_id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
    if (client.config?.active === false) return res.status(403).json({ success: false, error: 'Client inactive' });
    return supportClientHandler(req, res);
  } catch (error) {
    safeErrorLog('SUPPORT_CLIENT_PROTECTION_ERROR', error, { client_id: session.client_id });
    return res.status(500).json({ success: false, error: 'Unable to verify client access' });
  }
};
