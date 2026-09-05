const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase environment variables are missing");
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

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getClientId() {
  const result = await supabaseRequest(
    `clients?slug=eq.${encodeURIComponent(CLIENT_SLUG)}&select=id&limit=1`,
    { method: "GET" }
  );

  if (!Array.isArray(result) || !result[0]?.id) {
    throw new Error("First Bike client was not found");
  }

  return result[0].id;
}

async function getConversationId(clientId, sessionId) {
  const result = await supabaseRequest(
    `conversations?client_id=eq.${clientId}&session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
    { method: "GET" }
  );

  if (!Array.isArray(result) || !result[0]?.id) {
    throw new Error("Conversation was not found");
  }

  return result[0].id;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      session_id,
      request_type,
      customer_name,
      phone,
      reason
    } = req.body || {};

    if (!session_id) {
      return res.status(400).json({
        error: "session_id is required"
      });
    }

    if (
      request_type !== "human_handoff" &&
      request_type !== "callback"
    ) {
      return res.status(400).json({
        error: "Invalid request_type"
      });
    }

    if (!customer_name || !phone) {
      return res.status(400).json({
        error: "Name and phone are required"
      });
    }

    const clientId = await getClientId();

    const conversationId =
      await getConversationId(clientId, session_id);

    await supabaseRequest(
      "contact_requests",
      {
        method: "POST",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          client_id: clientId,
          conversation_id: conversationId,
          request_type,
          customer_name: String(customer_name).trim(),
          phone: String(phone).trim(),
          reason: reason
            ? String(reason).trim()
            : null,
          status: "new"
        })
      }
    );

    const updateField =
      request_type === "human_handoff"
        ? "human_handoff"
        : "callback_requested";

    await supabaseRequest(
      `conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          [updateField]: true,
          resolved_by_ai: false
        })
      }
    );

    return res.status(200).json({
      success: true,
      request_type,
      conversation_id: conversationId
    });

  } catch (error) {
    console.error("CONTACT API ERROR:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};
