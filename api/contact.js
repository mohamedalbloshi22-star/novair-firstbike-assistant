const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


/*
==================================================
Supabase
==================================================
*/

async function supabaseRequest(path, options = {}) {

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Supabase environment variables are missing"
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,

      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text}`
    );
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
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


/*
==================================================
Get Client
==================================================
*/

async function getClient(clientSlug) {

  const result =
    await supabaseRequest(
      `clients` +
      `?slug=eq.${encodeURIComponent(clientSlug)}` +
      `&select=id,name,slug,config` +
      `&limit=1`,
      {
        method: "GET"
      }
    );


  if (
    !Array.isArray(result) ||
    !result[0]?.id
  ) {
    return null;
  }


  const client =
    result[0];


  /*
    منع استقبال الطلبات لعميل غير فعال.
  */

  if (
    client.config &&
    client.config.active === false
  ) {
    return {
      ...client,
      inactive: true
    };
  }


  return client;
}


/*
==================================================
Get Conversation
==================================================
*/

async function getConversation(
  clientId,
  sessionId
) {

  const result =
    await supabaseRequest(
      `conversations` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=id,client_id,session_id,status` +
      `&limit=1`,
      {
        method: "GET"
      }
    );


  if (
    !Array.isArray(result) ||
    !result[0]?.id
  ) {
    return null;
  }


  return result[0];
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


  try {

    const body =
      req.body || {};


    const clientSlug =
      normalizeSlug(
        body.client_slug
      );


    const sessionId =
      cleanText(
        body.session_id
      );


    const requestType =
      cleanText(
        body.request_type
      );


    const customerName =
      cleanText(
        body.customer_name
      );


    const phone =
      cleanText(
        body.phone
      );


    const reason =
      cleanText(
        body.reason
      );


    /*
    ==================================================
    Validate client
    ==================================================
    */

    if (!clientSlug) {

      return res.status(400).json({
        error:
          "Valid client_slug is required"
      });
    }


    /*
    ==================================================
    Validate session
    ==================================================
    */

    if (!sessionId) {

      return res.status(400).json({
        error:
          "session_id is required"
      });
    }


    /*
    ==================================================
    Validate request type
    ==================================================
    */

    if (
      requestType !== "human_handoff" &&
      requestType !== "callback"
    ) {

      return res.status(400).json({
        error:
          "Invalid request_type"
      });
    }


    /*
    ==================================================
    Validate contact information
    ==================================================
    */

    if (
      !customerName ||
      !phone
    ) {

      return res.status(400).json({
        error:
          "Name and phone are required"
      });
    }


    /*
    ==================================================
    Get selected client
    ==================================================
    */

    const client =
      await getClient(
        clientSlug
      );


    if (!client) {

      return res.status(404).json({
        error:
          "Client not found"
      });
    }


    if (client.inactive) {

      return res.status(403).json({
        error:
          "Client is inactive"
      });
    }


    /*
    ==================================================
    Find conversation belonging to this client
    ==================================================
    */

    const conversation =
      await getConversation(
        client.id,
        sessionId
      );


    if (!conversation) {

      return res.status(404).json({
        error:
          "Conversation was not found for this client"
      });
    }


    /*
    ==================================================
    Create contact request
    ==================================================
    */

    await supabaseRequest(
      "contact_requests",
      {
        method: "POST",

        headers: {
          Prefer:
            "return=minimal"
        },

        body: JSON.stringify({
          client_id:
            client.id,

          conversation_id:
            conversation.id,

          request_type:
            requestType,

          customer_name:
            customerName,

          phone,

          reason:
            reason || null,

          status:
            "new"
        })
      }
    );


    /*
    ==================================================
    Update conversation
    ==================================================
    */

    const updateField =
      requestType ===
      "human_handoff"
        ? "human_handoff"
        : "callback_requested";


    await supabaseRequest(
      `conversations` +
      `?id=eq.${encodeURIComponent(conversation.id)}` +
      `&client_id=eq.${encodeURIComponent(client.id)}`,
      {
        method: "PATCH",

        headers: {
          Prefer:
            "return=minimal"
        },

        body: JSON.stringify({
          [updateField]: true,
          resolved_by_ai: false
        })
      }
    );


    /*
    ==================================================
    Success
    ==================================================
    */

    return res.status(200).json({

      success: true,

      client: {
        id: client.id,
        name: client.name,
        slug: client.slug
      },

      request_type:
        requestType,

      conversation_id:
        conversation.id
    });


  } catch (error) {

    console.error(
      "CONTACT API ERROR:",
      error
    );


    return res.status(500).json({
      error:
        "Internal server error"
    });
  }
};
