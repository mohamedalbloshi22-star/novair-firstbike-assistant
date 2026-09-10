const crypto = require("crypto");

const ADMIN_PASSWORD =
  process.env.NOVAIRE_ADMIN_PASSWORD;

const ADMIN_SESSION_SECRET =
  process.env.NOVAIRE_ADMIN_SESSION_SECRET || ADMIN_PASSWORD;

const COOKIE_NAME =
  "novaire_admin_session";

const SESSION_HOURS = 8;

function sign(value) {
  if (!ADMIN_SESSION_SECRET) {
    return "";
  }

  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function getCookie(req, name) {
  const raw =
    req.headers.cookie || "";

  const cookies =
    raw.split(";");

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

function verifySessionToken(token) {
  if (
    !token ||
    !ADMIN_SESSION_SECRET
  ) {
    return false;
  }

  const parts =
    String(token).split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [expires, signature] =
    parts;

  if (!/^\d+$/.test(expires)) {
    return false;
  }

  if (
    Date.now() >
    Number(expires)
  ) {
    return false;
  }

  const expected =
    sign(expires);

  try {
    const actualBuffer =
      Buffer.from(
        signature,
        "utf8"
      );

    const expectedBuffer =
      Buffer.from(
        expected,
        "utf8"
      );

    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
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

function isAdminSession(req) {
  const token =
    getCookie(
      req,
      COOKIE_NAME
    );

  return verifySessionToken(
    token
  );
}

module.exports = {
  isAdminSession,
  COOKIE_NAME,
  SESSION_HOURS
};
