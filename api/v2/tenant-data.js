const { parseSession, cookieValue, requireTenant, securityHeaders } = require('../../lib/v2/security');

module.exports = async function handler(req, res) {
  securityHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const claims = parseSession(cookieValue(req), process.env.BSR1_V2_SESSION_SECRET);
  if (!claims) return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
  const tenantId = String(req.query?.tenantId || '');
  if (!tenantId || !requireTenant(claims, tenantId)) return res.status(403).json({ error: 'TENANT_ACCESS_DENIED' });
  return res.status(200).json({ tenantId, role: claims.role, modules: ['assistant', 'knowledge', 'contacts', 'support', 'usage'] });
};
