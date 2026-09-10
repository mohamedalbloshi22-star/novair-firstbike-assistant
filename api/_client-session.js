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

    const clientId =
      String(data?.client_id || "");

    const clientSlug =
      String(data?.client_slug || "");

    const expires =
      Number(data?.expires);

    if (
      !clientId ||
      clientId.length > 128 ||
      !/^[a-z0-9_-]{2,80}$/.test(clientSlug) ||
      !Number.isFinite(expires) ||
      expires <= Date.now()
    ) {
      return null;
    }

    return {
      client_id:
        clientId,

      client_slug:
        clientSlug
    };

  } catch {
    return null;
  }
}

module.exports = {
  getClientSession,
  COOKIE_NAME
};
