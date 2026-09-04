const { randomUUID } = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";

const SYSTEM_AR = `
أنت المساعد الذكي لخدمة عملاء First Bike في العين.

معلومات المحل:
- النشاط: تأجير وتصليح الدراجات النارية وقطع الغيار.
- الموقع: العين، السلامات، شارع الهيبة، بجانب كافيه 1 مليون.
- ساعات العمل: يوميًا من الساعة 3 عصرًا حتى 12 منتصف الليل.

أسعار التأجير بالساعة:
- 50cc: 80 درهم.
- 90cc: 150 درهم.
- 220cc: 200 درهم.
- 400cc: 250 درهم.
- 800cc فأعلى: 300 درهم.

أسعار التصليح وقطع الغيار تختلف حسب نوع العطل والقطعة والتركيب.

قواعد مهمة:
- أجب بالعربية بشكل واضح ومختصر.
- لا تخترع معلومات غير موجودة.
- إذا لم تعرف معلومة، أخبر العميل بوضوح أن المعلومة غير متوفرة حاليًا.
- لا تعطِ سعرًا للتصليح أو قطع الغيار إذا لم يكن السعر معروفًا.
`;

const SYSTEM_EN = `
You are the smart customer service assistant for First Bike in Al Ain.

Business information:
- Services: motorcycle rental, motorcycle repair and spare parts.
- Location: Al Ain, Al Salamat, Al Heeba Street, next to 1 Million Cafe.
- Opening hours: daily from 3 PM until midnight.

Hourly motorcycle rental prices:
- 50cc: AED 80.
- 90cc: AED 150.
- 220cc: AED 200.
- 400cc: AED 250.
- 800cc and above: AED 300.

Repair and spare-part prices depend on the fault, part and installation.

Important rules:
- Reply clearly and concisely in English.
- Do not invent information.
- If information is unavailable, tell the customer clearly.
- Do not invent repair or spare-part prices.
`;

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

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getClientId() {
  const result = await supabaseRequest(
    `clients?slug=eq.${encodeURIComponent(CLIENT_SLUG)}&select=id&limit=1`,
    {
      method: "GET"
    }
  );

  if (!Array.isArray(result) || !result[0]?.id) {
    throw new Error("First Bike client was not found");
  }

  return result[0].id;
}

async function createOrGetConversation(
  clientId,
  sessionId
) {
  const existing = await supabaseRequest(
    `conversations?client_id=eq.${clientId}&session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
    {
      method: "GET"
    }
  );

  if (Array.isArray(existing) && existing[0]?.id) {
    return existing[0].id;
  }

  const created = await supabaseRequest(
    "conversations",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        client_id: clientId,
        session_id: sessionId,
        status: "active",
        resolved_by_ai: false,
        human_handoff: false,
        callback_requested: false
      })
    }
  );

  if (!Array.isArray(created) || !created[0]?.id) {
    throw new Error("Conversation could not be created");
  }

  return created[0].id;
}

async function saveMessage(
  conversationId,
  sender,
  content,
  inputTokens = null,
  outputTokens = null
) {
  await supabaseRequest(
    "messages",
    {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender,
        content,
        input_tokens: inputTokens,
        output_tokens: outputTokens
      })
    }
  );

  console.log(
    `Saved ${sender} message for conversation ${conversationId}`
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is missing"
      );
    }

    const {
      messages,
      language = "ar",
      session_id
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Messages are required"
      });
    }

    const selectedLanguage =
      language === "en" ? "en" : "ar";

    const sessionId =
      session_id ||
      `firstbike-${randomUUID()}`;

    let clientId = null;
    let conversationId = null;
    let userLogged = false;
    let assistantLogged = false;

    const latestUserMessage =
      [...messages]
        .reverse()
        .find(message => message.role === "user");

    try {
      clientId = await getClientId();

      conversationId =
        await createOrGetConversation(
          clientId,
          sessionId
        );

      if (
        conversationId &&
        latestUserMessage?.content
      ) {
        await saveMessage(
          conversationId,
          "user",
          String(latestUserMessage.content)
        );

        userLogged = true;
      }
    } catch (dbError) {
      console.error(
        "SUPABASE USER LOGGING ERROR:",
        dbError
      );
    }

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system:
            selectedLanguage === "en"
              ? SYSTEM_EN
              : SYSTEM_AR,
          messages: messages.map(message => ({
            role: message.role,
            content: message.content
          }))
        })
      }
    );

    const anthropicText =
      await anthropicResponse.text();

    if (!anthropicResponse.ok) {
      console.error(
        "ANTHROPIC ERROR:",
        anthropicResponse.status,
        anthropicText
      );

      return res.status(anthropicResponse.status).json({
        error: "Anthropic request failed"
      });
    }

    const data =
      JSON.parse(anthropicText);

    const assistantText =
      data?.content?.[0]?.text || "";

    try {
      if (
        conversationId &&
        assistantText
      ) {
        await saveMessage(
          conversationId,
          "assistant",
          assistantText,
          data?.usage?.input_tokens ?? null,
          data?.usage?.output_tokens ?? null
        );

        assistantLogged = true;
      }
    } catch (dbError) {
      console.error(
        "SUPABASE ASSISTANT LOGGING ERROR:",
        dbError
      );
    }

    return res.status(200).json({
      ...data,

      novaire: {
        session_id: sessionId,
        conversation_id: conversationId,
        language: selectedLanguage,

        logging: {
          user: userLogged,
          assistant: assistantLogged
        }
      }
    });

  } catch (error) {
    console.error(
      "CHAT API ERROR:",
      error
    );

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};
