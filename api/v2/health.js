const { securityHeaders } = require('../../lib/v2/security');

module.exports = async function handler(req, res) {
  securityHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.BSR1_V2_SESSION_SECRET);
  return res.status(configured ? 200 : 503).json({
    service: 'BASEERA BSR-1 Clean Build V2',
    environment: 'preview',
    status: configured ? 'ready' : 'configuration_required',
    productionCutover: false,
    timestamp: new Date().toISOString()
  });
};
