const crypto = require("crypto");

const ADMIN_PASSWORD =
  process.env.NOVAIRE_ADMIN_PASSWORD;

const COOKIE_NAME =
  "novaire_admin_session";

const SESSION_HOURS = 8;

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
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
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
    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

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
