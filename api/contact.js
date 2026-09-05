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
Create Conversation
==================================================
*/

async function createConversation(
  clientId,
  sessionId,
  language
) {

  const result =
    await supabaseRequest(
      "conversations",
      {
        method: "POST",

        headers: {
          Prefer:
            "return=representation"
        },

        body: JSON.stringify({
          client_id:
            clientId,

          session_id:
            sessionId,

          status:
            "active",

          resolved_by_ai:
            false,

          human_handoff:
            false,

          callback_requested:
            false,

          language:
            language === "en"
              ? "en"
              : "ar"
        })
      }
    );


  if (
    !Array.isArray(result) ||
    !result[0]?.id
  ) {
    throw new Error(
      "Unable to create conversation"
    );
  }


  return result[0];
}


/*
==================================================
Get Or Create Conversation
==================================================
*/

async function getOrCreateConversation(
  clientId,
  sessionId,
  language
) {

  const existing =
    await getConversation(
      clientId,
      sessionId
    );


  if (existing) {
    return existing;
  }


  try {

    return await createConversation(
      clientId,
      sessionId,
      language
    );

  } catch (error) {

    /*
      حماية إضافية إذا تم إنشاء نفس المحادثة
      في نفس اللحظة من طلب آخر.
    */

    const retry =
      await getConversation(
        clientId,
        sessionId
      );


    if (retry) {
      return retry;
    }


    throw error;
  }
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


    const language =
      cleanText(
        body.language
      ).toLowerCase() === "en"
        ? "en"
        : "ar";


    /*
    ==================================================
    Validate Client
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
    Validate Session
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
    Validate Request Type
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
    Validate Contact Information
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
    Get Selected Client
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
    Find Or Create Conversation
    ==================================================
    */

    const conversation =
      await getOrCreateConversation(
        client.id,
        sessionId,
        language
      );


    /*
    ==================================================
    Create Contact Request
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
    Update Conversation
    ==================================================
    */

    const updateField =
      requestType === "human_handoff"
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
          [updateField]:
            true,

          resolved_by_ai:
            false
        })
      }
    );


    /*
    ==================================================
    Success
    ==================================================
    */

    return res.status(200).json({

      success:
        true,

      client: {
        id:
          client.id,

        name:
          client.name,

        slug:
          client.slug
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
