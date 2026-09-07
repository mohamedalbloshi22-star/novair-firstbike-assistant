const crypto = require("crypto");

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const COOKIE_NAME =
  "novaire_client_session";

const SESSION_HOURS = 8;


function safeEqual(a, b) {

  const aa =
    Buffer.from(String(a || ""));

  const bb =
    Buffer.from(String(b || ""));

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aa,
    bb
  );
}


function sign(value) {

  const secret =
    process.env.NOVAIRE_ADMIN_PASSWORD;

  if (!secret) {
    return "";
  }

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}


function clearClientCookie(res) {

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}


async function getClient(slug) {

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,config&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization:
            `Bearer ${SUPABASE_KEY}`
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      "Unable to load client"
    );
  }

  const rows =
    await response.json();

  return rows[0] || null;
}


module.exports =
async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  if (req.method !== "POST") {

    res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

    return;
  }


  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {

    res.status(500).json({
      success: false,
      error: "Server configuration error"
    });

    return;
  }


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};


    const action =
      String(
        body.action || "login"
      )
        .trim()
        .toLowerCase();


    if (action === "logout") {

      clearClientCookie(res);

      res.status(200).json({
        success: true,
        authenticated: false
      });

      return;
    }


    const slug =
      String(
        body.client_slug || ""
      )
        .trim()
        .toLowerCase();


    const password =
      String(
        body.password || ""
      );


    if (
      !/^[a-z0-9_-]{2,80}$/.test(slug) ||
      !password
    ) {

      res.status(400).json({
        success: false,
        error: "بيانات الدخول غير مكتملة."
      });

      return;
    }


    const client =
      await getClient(slug);


    if (!client) {

      res.status(401).json({
        success: false,
        error: "بيانات الدخول غير صحيحة."
      });

      return;
    }


    const config =
      client.config &&
      typeof client.config === "object"
        ? client.config
        : {};


    if (config.active === false) {

      res.status(403).json({
        success: false,
        error: "حساب العميل غير نشط."
      });

      return;
    }


    const clientPassword =
      String(
        config.portal_password || ""
      );


    if (
      !clientPassword ||
      !safeEqual(
        password,
        clientPassword
      )
    ) {

      res.status(401).json({
        success: false,
        error: "بيانات الدخول غير صحيحة."
      });

      return;
    }


    const expires =
      Date.now() +
      SESSION_HOURS *
      60 *
      60 *
      1000;


    const payload =
      Buffer.from(
        JSON.stringify({
          client_id: client.id,
          client_slug: client.slug,
          expires
        })
      ).toString("base64url");


    const signature =
      sign(payload);


    if (!signature) {

      res.status(500).json({
        success: false,
        error: "Session configuration error"
      });

      return;
    }


    const token =
      `${payload}.${signature}`;


    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 60 * 60}`
    );


    res.status(200).json({
      success: true,
      authenticated: true,
      client: {
        name: client.name,
        slug: client.slug
      }
    });


  } catch (error) {

    console.error(
      "CLIENT AUTH ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
};
