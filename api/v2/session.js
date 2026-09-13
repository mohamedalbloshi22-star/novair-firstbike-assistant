const { COOKIE, createSession, securityHeaders } = require('../../lib/v2/security');

module.exports = async function handler(req, res) {
  securityHeaders(res);
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return res.status(200).json({ authenticated: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const expected = process.env.BSR1_V2_PREVIEW_ACCESS_CODE;
  if (!expected || String(req.body?.accessCode || '') !== expected) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  const tenantId = String(req.body?.tenantId || 'preview-tenant-a');
  const role = req.body?.role === 'founder' ? 'founder' : 'client_admin';
  const token = createSession({ userId: `preview-${role}`, tenantId, role }, process.env.BSR1_V2_SESSION_SECRET);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
  return res.status(200).json({ authenticated: true, tenantId, role });
};
