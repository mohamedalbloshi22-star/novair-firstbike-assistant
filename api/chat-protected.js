const { getClientBySlug } = require('../lib/nsr-usage');
const { checkChatRateLimit } = require('../lib/nsr-chat-rate-limit');
const { safeErrorLog } = require('../lib/nsr-safe-log');
const chatHandler = require('./chat');

function normalizeClientSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{2,80}$/.test(slug) ? slug : '';
}

function installPublicStreamFilter(res) {
  const originalWrite = res.write.bind(res);
  res.write = function filteredWrite(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    const trailingNewline = text.endsWith('\n');
    const output = text
      .split('\n')
      .map((line) => {
        if (!line.trim()) return '';
        try {
          const event = JSON.parse(line);
          if (event?.type === 'delta') return JSON.stringify({ type: 'delta', text: String(event.text || '') });
          if (event?.type === 'error') return JSON.stringify({ type: 'error', error: 'Unable to process chat request' });
          if (event?.type === 'start' || event?.type === 'done') return JSON.stringify({ type: event.type });
          return '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const safeOutput = output ? output + (trailingNewline ? '\n' : '') : '';
    return originalWrite(safeOutput, encoding, callback);
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const slug = normalizeClientSlug(req.body?.client_slug);
    if (!slug) return res.status(400).json({ error: 'Valid client_slug is required' });

    const client = await getClientBySlug(slug);
    if (!client?.id) return res.status(404).json({ error: 'Client not found' });
    if (client.config?.active === false) return res.status(403).json({ error: 'Client inactive' });

    const rate = await checkChatRateLimit(client.id, req);
    if (!rate.allowed) {
      if (rate.retry_after_seconds > 0) {
        res.setHeader('Retry-After', String(rate.retry_after_seconds));
      }
      return res.status(429).json({
        error: 'Too many chat requests',
        code: 'CHAT_RATE_LIMITED',
        retry_after_seconds: rate.retry_after_seconds
      });
    }

    installPublicStreamFilter(res);
    return chatHandler(req, res);
  } catch (error) {
    safeErrorLog('CHAT_RATE_LIMIT_ERROR', error);
    return res.status(503).json({
      error: 'Chat protection temporarily unavailable',
      code: 'CHAT_RATE_LIMIT_UNAVAILABLE'
    });
  }
};
