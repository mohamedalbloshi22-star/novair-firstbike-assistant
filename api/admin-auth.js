const crypto = require("crypto");
const { safeErrorLog } = require('../lib/nsr-safe-log');

const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.NOVAIRE_ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COOKIE_NAME = "novaire_admin_session";
const SESSION_HOURS = 8;
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const LOCKOUT_SECONDS = 15 * 60;

function sign(value) {
  return crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(value).digest("hex");
}

function createSession() {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const value = String(expires);
  return `${value}.${sign(value)}`;
}

function verifySession(token) {
  if (!token || !ADMIN_SESSION_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expires, signature] = parts;
  if (!/^\d+$/.test(expires) || Date.now() > Number(expires)) return false;
  const expected = sign(expires);
  try {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const item of raw.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || "").trim() || String(req.socket?.remoteAddress || "unknown");
}

function attemptKey(req) {
  return `admin:${getRequestIp(req)}`;
}

function normalizeState(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  const lockUntil = row.lock_until ? Date.parse(row.lock_until) : 0;
  return {
    count: Number(row.failure_count || 0),
    lockedUntil: Number.isFinite(lockUntil) ? lockUntil : 0
  };
}

async function loginRpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Admin login rate limit unavailable (${response.status})`);
  return text ? JSON.parse(text) : null;
}

async function getAttemptState(key) {
  return normalizeState(await loginRpc("nsr_get_login_state", {
    p_key: key,
    p_window_seconds: ATTEMPT_WINDOW_SECONDS
  }));
}

async function recordFailedAttempt(key) {
  return normalizeState(await loginRpc("nsr_record_login_failure", {
    p_key: key,
    p_max_attempts: MAX_FAILED_ATTEMPTS,
    p_window_seconds: ATTEMPT_WINDOW_SECONDS,
    p_lock_seconds: LOCKOUT_SECONDS
  }));
}

async function clearFailedAttempts(key) {
  await loginRpc("nsr_clear_login_failures", { p_key: key });
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 60 * 60}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

module.exports = async function handler(req, res) {
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) return res.status(500).json({ success: false, error: "Missing admin configuration" });

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "GET") {
    return res.status(200).json({ success: true, authenticated: verifySession(getCookie(req, COOKIE_NAME)) });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body || {};
  const action = String(body.action || "login");

  if (action === "logout") {
    clearSessionCookie(res);
    return res.status(200).json({ success: true, authenticated: false });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ success: false, error: "Missing rate limit configuration" });
  }

  const key = attemptKey(req);

  try {
    const state = await getAttemptState(key);
    const now = Date.now();

    if (state?.lockedUntil && now < state.lockedUntil) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((state.lockedUntil - now) / 1000))));
      return res.status(429).json({ success: false, error: "Too many login attempts. Try again later." });
    }

    const password = String(body.password || "");
    const correct = Buffer.from(password);
    const expected = Buffer.from(ADMIN_PASSWORD);
    const valid = correct.length === expected.length && crypto.timingSafeEqual(correct, expected);

    if (!valid) {
      const failed = await recordFailedAttempt(key);
      if (failed?.lockedUntil && Date.now() < failed.lockedUntil) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((failed.lockedUntil - Date.now()) / 1000))));
        return res.status(429).json({ success: false, error: "Too many login attempts. Try again later." });
      }
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    await clearFailedAttempts(key);
    const token = createSession();
    setSessionCookie(res, token);
    return res.status(200).json({ success: true, authenticated: true });
  } catch (error) {
    safeErrorLog('ADMIN_AUTH_RATE_LIMIT_ERROR', error);
    return res.status(503).json({ success: false, error: "Login service temporarily unavailable" });
  }
};
