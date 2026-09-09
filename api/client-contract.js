const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { isAdminSession } = require('./_admin-session');

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function clean(value) {
  return String(value || '').trim();
}

function cleanDate(value) {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!isAdminSession(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const clientId = clean(req.body && req.body.client_id);
    if (!clientId) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    const rows = await supabaseRequest(
      `clients?id=eq.${encodeURIComponent(clientId)}&select=id,config&limit=1`
    );

    const client = Array.isArray(rows) ? rows[0] : null;
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const config = client.config && typeof client.config === 'object'
      ? client.config
      : {};

    const monthsRaw = Number(req.body && req.body.contract_term_months);
    const months = Number.isFinite(monthsRaw) && monthsRaw > 0
      ? Math.min(Math.round(monthsRaw), 120)
      : null;

    const nextConfig = {
      ...config,
      contract_start_date: cleanDate(req.body && req.body.contract_start_date),
      contract_end_date: cleanDate(req.body && req.body.contract_end_date),
      contract_term_months: months,
      client_legal_name: clean(req.body && req.body.client_legal_name),
      client_license_no: clean(req.body && req.body.client_license_no),
      client_signatory_name: clean(req.body && req.body.client_signatory_name),
      client_signatory_title: clean(req.body && req.body.client_signatory_title),
      contract_status: clean(req.body && req.body.contract_status) || 'draft'
    };

    await supabaseRequest(
      `clients?id=eq.${encodeURIComponent(clientId)}`,
      {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { config: nextConfig }
      }
    );

    return res.status(200).json({
      success: true,
      contract: {
        contract_start_date: nextConfig.contract_start_date,
        contract_end_date: nextConfig.contract_end_date,
        contract_term_months: nextConfig.contract_term_months,
        contract_status: nextConfig.contract_status
      }
    });
  } catch (error) {
    console.error('CLIENT CONTRACT ERROR:', error);
    return res.status(500).json({ error: 'Unable to save contract data' });
  }
};
