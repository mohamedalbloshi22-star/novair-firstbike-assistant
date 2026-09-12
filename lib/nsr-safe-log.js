function sanitizeErrorMessage(error) {
  let message = String(error?.message || error || 'Unknown error');

  const secretPatterns = [
    /(bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,
    /(apikey["'\s:=]+)[A-Za-z0-9._~+\/-]+=*/gi,
    /(authorization["'\s:=]+)[A-Za-z0-9._~+\/-]+=*/gi,
    /(sk_(?:live|test)_[A-Za-z0-9]+)/gi,
    /(whsec_[A-Za-z0-9]+)/gi,
    /(re_[A-Za-z0-9]+)/gi,
    /(sb_(?:secret|publishable)_[A-Za-z0-9_-]+)/gi,
    /(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g
  ];

  for (const pattern of secretPatterns) {
    message = message.replace(pattern, (match, prefix) => prefix && prefix !== match ? `${prefix}[REDACTED]` : '[REDACTED]');
  }

  message = message.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return message.slice(0, 500);
}

function safeErrorLog(label, error, extra = {}) {
  const payload = {
    event: String(label || 'ERROR').slice(0, 80),
    message: sanitizeErrorMessage(error)
  };

  if (extra && typeof extra === 'object') {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null) continue;
      payload[String(key).slice(0, 40)] = sanitizeErrorMessage(String(value)).slice(0, 120);
    }
  }

  console.error(JSON.stringify(payload));
}

module.exports = { sanitizeErrorMessage, safeErrorLog };
