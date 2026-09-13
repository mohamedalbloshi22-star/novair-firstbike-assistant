const crypto = require('node:crypto');

const COOKIE = 'bsr1_v2_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(payload, secret) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET_INVALID');
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSession(claims, secret, now = Date.now()) {
  if (!claims?.userId || !claims?.tenantId || !['client_admin', 'founder'].includes(claims.role)) {
    throw new Error('SESSION_CLAIMS_INVALID');
  }
  const payload = encode({ ...claims, issuedAt: now, expiresAt: now + SESSION_TTL_MS });
  return `${payload}.${sign(payload, secret)}`;
}

function parseSession(token, secret, now = Date.now()) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;
  let expected;
  try { expected = sign(payload, secret); } catch { return null; }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.userId || !claims.tenantId || !['client_admin', 'founder'].includes(claims.role)) return null;
    if (!Number.isFinite(claims.expiresAt) || claims.expiresAt <= now) return null;
    return claims;
  } catch { return null; }
}

function cookieValue(req, name = COOKIE) {
  const raw = String(req?.headers?.cookie || '');
  for (const item of raw.split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function requireTenant(claims, requestedTenantId) {
  if (!claims) return false;
  if (claims.role === 'founder') return true;
  const actual = Buffer.from(String(claims.tenantId));
  const requested = Buffer.from(String(requestedTenantId));
  return actual.length === requested.length && crypto.timingSafeEqual(actual, requested);
}

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

module.exports = { COOKIE, SESSION_TTL_MS, createSession, parseSession, cookieValue, requireTenant, securityHeaders };
