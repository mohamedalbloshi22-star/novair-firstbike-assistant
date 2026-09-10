const crypto = require("crypto");

const ADMIN_PASSWORD =
  process.env.NOVAIRE_ADMIN_PASSWORD;

const COOKIE_NAME =
  "novaire_admin_session";

const SESSION_HOURS = 8;
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

const loginAttempts = globalThis.__novaireAdminLoginAttempts || new Map();
globalThis.__novaireAdminLoginAttempts = loginAttempts;

function sign(value) {
  return crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(value)
    .digest("hex");
}

function createSession() {
  const expires =
    Date.now() +
    SESSION_HOURS * 60 * 60 * 1000;

  const value = String(expires);
  const signature = sign(value);

  return `${value}.${signature}`;
}

function verifySession(token) {
  if (!token || !ADMIN_PASSWORD) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [expires, signature] = parts;

  if (!/^\d+$/.test(expires)) {
    return false;
  }

  if (Date.now() > Number(expires)) {
    return false;
  }

  const expected = sign(expires);

  try {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      actualBuffer,
      expectedBuffer
    );
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";

  const cookies = raw.split(";");

  for (const item of cookies) {
    const [key, ...rest] =
      item.trim().split("=");

    if (key === name) {
      return decodeURIComponent(
        rest.join("=")
      );
    }
  }

  return "";
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return forwarded ||
    String(req.headers["x-real-ip"] || "").trim() ||
    String(req.socket?.remoteAddress || "unknown");
}

function getAttemptState(ip) {
  const now = Date.now();
  const current = loginAttempts.get(ip);

  if (!current) {
    return {
      count: 0,
      windowStartedAt: now,
      lockedUntil: 0
    };
  }

  if (current.lockedUntil && now < current.lockedUntil) {
    return current;
  }

  if (now - current.windowStartedAt >= ATTEMPT_WINDOW_MS) {
    const reset = {
      count: 0,
      windowStartedAt: now,
      lockedUntil: 0
    };

    loginAttempts.set(ip, reset);
    return reset;
  }

  if (current.lockedUntil && now >= current.lockedUntil) {
    const reset = {
      count: 0,
      windowStartedAt: now,
      lockedUntil: 0
    };

    loginAttempts.set(ip, reset);
    return reset;
  }

  return current;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const state = getAttemptState(ip);
  state.count += 1;

  if (state.count >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_MS;
  }

  loginAttempts.set(ip, state);
  return state;
}

function clearFailedAttempts(ip) {
  loginAttempts.delete(ip);
}

function setSessionCookie(res, token) {
  const maxAge =
    SESSION_HOURS * 60 * 60;

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

module.exports = async function handler(req, res) {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({
      success: false,
      error: "Missing admin configuration"
    });
  }

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  if (req.method === "GET") {
    const token =
      getCookie(
        req,
        COOKIE_NAME
      );

    return res.status(200).json({
      success: true,
      authenticated:
        verifySession(token)
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const body = req.body || {};
  const action =
    String(body.action || "login");

  if (action === "logout") {
    clearSessionCookie(res);

    return res.status(200).json({
      success: true,
      authenticated: false
    });
  }

  const ip = getRequestIp(req);
  const state = getAttemptState(ip);
  const now = Date.now();

  if (state.lockedUntil && now < state.lockedUntil) {
    const retryAfter = Math.max(
      1,
      Math.ceil((state.lockedUntil - now) / 1000)
    );

    res.setHeader("Retry-After", String(retryAfter));

    return res.status(429).json({
      success: false,
      error: "Too many login attempts. Try again later."
    });
  }

  const password =
    String(body.password || "");

  const correct =
    Buffer.from(password);

  const expected =
    Buffer.from(ADMIN_PASSWORD);

  let valid = false;

  if (correct.length === expected.length) {
    valid =
      crypto.timingSafeEqual(
        correct,
        expected
      );
  }

  if (!valid) {
    const failed = recordFailedAttempt(ip);

    if (failed.lockedUntil && Date.now() < failed.lockedUntil) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil(LOCKOUT_MS / 1000))
      );

      return res.status(429).json({
        success: false,
        error: "Too many login attempts. Try again later."
      });
    }

    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

  clearFailedAttempts(ip);

  const token =
    createSession();

  setSessionCookie(
    res,
    token
  );

  return res.status(200).json({
    success: true,
    authenticated: true
  });
};
