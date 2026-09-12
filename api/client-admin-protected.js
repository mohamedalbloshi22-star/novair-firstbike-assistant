const { isAdminSession } = require('./_admin-session');
const clientAdminHandler = require('./client-admin');
const { safeErrorLog } = require('../lib/nsr-safe-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function clean(value) {
  return String(value || '').trim();
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function validateCommercialInputs(body) {
  if (hasValue(body.custom_ai_limit)) {
    const limit = Number(body.custom_ai_limit);
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return 'custom_ai_limit must be a positive integer';
    }
  }

  for (const key of ['setup_fee_override_aed', 'monthly_fee_override_aed']) {
    if (!hasValue(body[key])) continue;
    const amount = Number(body[key]);
    if (!Number.isFinite(amount) || amount < 0) {
      return `${key} must be a non-negative number`;
    }
  }

  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Server configuration error' });
  if (!isAdminSession(req)) return res.status(401).json({ error: 'Unauthorized' });

  const action = clean(req.body?.action);

  if (action === 'create_with_plan' || action === 'assign_plan') {
    const validationError = validateCommercialInputs(req.body || {});
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
  }

  if (action !== 'delete') return clientAdminHandler(req, res);

  try {
    const clientId = clean(req.body?.client_id);
    if (!clientId) return res.status(400).json({ error: 'client_id is required' });

    const rows = await sb(`clients?id=eq.${encodeURIComponent(clientId)}&select=id,name,slug,config&limit=1`);
    const client = Array.isArray(rows) ? rows[0] : null;
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.slug === 'first-bike') return res.status(403).json({ error: 'First Bike cannot be deleted' });

    const active = !(client.config && client.config.active === false);
    if (active) {
      return res.status(409).json({
        error: 'Deactivate client before deletion',
        code: 'CLIENT_MUST_BE_INACTIVE'
      });
    }

    if (clean(req.body?.confirm_delete) !== 'DELETE' || clean(req.body?.confirm_slug) !== client.slug) {
      return res.status(409).json({
        error: 'Explicit deletion confirmation required',
        code: 'DELETE_CONFIRMATION_REQUIRED',
        required_slug: client.slug
      });
    }

    return clientAdminHandler(req, res);
  } catch (error) {
    safeErrorLog('CLIENT_DELETE_PROTECTION_ERROR', error, { client_id: clean(req.body?.client_id) });
    return res.status(500).json({ error: 'Unable to verify client deletion request' });
  }
};
