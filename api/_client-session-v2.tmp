const crypto = require("crypto");

const COOKIE_NAME =
  "novaire_client_session";

function sign(value) {
  const secret =
    process.env.NOVAIRE_CLIENT_SESSION_SECRET;

  if (!secret) {
    return "";
  }

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

function getCookie(req, name) {
  const raw =
    req.headers.cookie || "";

  for (const item of raw.split(";")) {
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

function getClientSession(req) {

  const token =
    getCookie(req, COOKIE_NAME);

  if (!token) {
    return null;
  }

  const parts =
    token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] =
    parts;

  const expected =
    sign(payload);

  if (!expected) {
    return null;
  }

  try {

    const actualBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(expected);

    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    if (
      !crypto.timingSafeEqual(
        actualBuffer,
        expectedBuffer
      )
    ) {
      return null;
    }

    const data =
      JSON.parse(
        Buffer.from(
          payload,
          "base64url"
        ).toString("utf8")
      );

    if (
      !data.client_id ||
      !data.client_slug ||
      !data.expires ||
      Date.now() > Number(data.expires)
    ) {
      return null;
    }

    return {
      client_id:
        String(data.client_id),

      client_slug:
        String(data.client_slug)
    };

  } catch {
    return null;
  }
}

module.exports = {
  getClientSession,
  COOKIE_NAME
};
