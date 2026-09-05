const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;


/*
==================================================
Supabase
==================================================
*/

async function supabaseRequest(path, options = {}) {

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase configuration is missing");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: options.method || "GET",

      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...(options.prefer
          ? { Prefer: options.prefer }
          : {})
      },

      body: options.body
        ? JSON.stringify(options.body)
        : undefined
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text}`
    );
  }

  if (!text) {
    return [];
  }

  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}


/*
==================================================
Helpers
==================================================
*/

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}


function normalizeSlug(value) {

  const slug =
    cleanText(value).toLowerCase();

  if (!/^[a-z0-9_-]{2,80}$/.test(slug)) {
    return "";
  }

  return slug;
}


function isAuthorized(body) {

  const password =
    cleanText(body?.password);

  return Boolean(
    ADMIN_PASSWORD &&
    password &&
    password === ADMIN_PASSWORD
  );
}


/*
==================================================
Client
==================================================
*/

async function getClient(clientSlug) {

  const rows =
    await supabaseRequest(
      `clients` +
      `?slug=eq.${encodeURIComponent(clientSlug)}` +
      `&select=id,name,slug` +
      `&limit=1`
    );

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return null;
  }

  return rows[0];
}


/*
==================================================
List Contact Requests
==================================================
*/

async function listRequests(clientId) {

  const rows =
    await supabaseRequest(
      `contact_requests` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,client_id,conversation_id,request_type,customer_name,phone,reason,status,created_at` +
      `&order=created_at.desc`
    );

  return Array.isArray(rows)
    ? rows
    : [];
}


/*
==================================================
Update Status
==================================================
*/

async function updateStatus(
  clientId,
  requestId,
  status
) {

  const allowedStatuses = [
    "new",
    "in_progress",
    "completed",
    "closed"
  ];


  if (!allowedStatuses.includes(status)) {

    return {
      statusCode: 400,
      data: {
        error: "Invalid status"
      }
    };
  }


  const existing =
    await supabaseRequest(
      `contact_requests` +
      `?id=eq.${encodeURIComponent(requestId)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id` +
      `&limit=1`
    );


  if (
    !Array.isArray(existing) ||
    existing.length === 0
  ) {

    return {
      statusCode: 404,
      data: {
        error: "Contact request not found"
      }
    };
  }


  const updated =
    await supabaseRequest(
      `contact_requests` +
      `?id=eq.${encodeURIComponent(requestId)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}`,
      {
        method: "PATCH",
        prefer: "return=representation",

        body: {
          status
        }
      }
    );


  return {
    statusCode: 200,

    data: {
      success: true,

      request:
        Array.isArray(updated) &&
        updated.length > 0
          ? updated[0]
          : null
    }
  };
}


/*
==================================================
Handler
==================================================
*/

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed"
    });
  }


  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY ||
    !ADMIN_PASSWORD
  ) {

    return res.status(500).json({
      error: "Server configuration is incomplete"
    });
  }


  const body =
    req.body || {};


  if (!isAuthorized(body)) {

    return res.status(401).json({
      error: "Unauthorized"
    });
  }


  try {

    const action =
      cleanText(body.action);


    const clientSlug =
      normalizeSlug(
        body.client_slug
      );


    if (!clientSlug) {

      return res.status(400).json({
        error: "Valid client_slug is required"
      });
    }


    const client =
      await getClient(clientSlug);


    if (!client) {

      return res.status(404).json({
        error: "Client not found"
      });
    }


    /*
    ==================================================
    LIST
    ==================================================
    */

    if (action === "list") {

      const requests =
        await listRequests(
          client.id
        );


      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
      );


      return res.status(200).json({

        success: true,

        client: {
          id: client.id,
          name: client.name,
          slug: client.slug
        },

        requests
      });
    }


    /*
    ==================================================
    UPDATE STATUS
    ==================================================
    */

    if (action === "update_status") {

      const requestId =
        cleanText(
          body.request_id
        );


      const status =
        cleanText(
          body.status
        );


      if (!requestId) {

        return res.status(400).json({
          error: "request_id is required"
        });
      }


      const result =
        await updateStatus(
          client.id,
          requestId,
          status
        );


      return res
        .status(result.statusCode)
        .json(result.data);
    }


    return res.status(400).json({
      error: "Invalid action"
    });


  } catch (error) {

    console.error(
      "CONTACT ADMIN API ERROR:",
      error
    );


    return res.status(500).json({

      error:
        "Unable to manage contact requests",

      details:
        error.message
    });
  }
};
