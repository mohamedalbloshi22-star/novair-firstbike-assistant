const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession, parseSession, requireTenant, SESSION_TTL_MS } = require('../lib/v2/security');

const secret = 'v2-test-secret-that-is-at-least-32-characters';
const base = { userId: 'u-a', tenantId: 'tenant-a', role: 'client_admin' };

test('valid session round trip', () => {
  const token = createSession(base, secret, 1000);
  assert.equal(parseSession(token, secret, 1001).tenantId, 'tenant-a');
});
test('tampered session is rejected', () => assert.equal(parseSession(`${createSession(base, secret)}x`, secret), null));
test('expired session is rejected', () => assert.equal(parseSession(createSession(base, secret, 0), secret, SESSION_TTL_MS + 1), null));
test('client tenant isolation denies cross-tenant access', () => assert.equal(requireTenant(base, 'tenant-b'), false));
test('client tenant isolation safely denies different-length id', () => assert.equal(requireTenant(base, 'other'), false));
test('client may access own tenant', () => assert.equal(requireTenant(base, 'tenant-a'), true));
test('founder may inspect tenants', () => assert.equal(requireTenant({ ...base, role: 'founder' }, 'tenant-b'), true));
