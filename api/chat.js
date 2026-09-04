const { randomUUID } = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SYSTEM_PROMPT_AR = `
أنت مساعد ذكي لمحل "First Bike" لتأجير وتصليح الدراجات النارية في مدينة العين، الإمارات.

معلومات المحل:
- الموقع: العين، السلامات، شارع الهيبة، بجانب كافيه 1 مليون.
- أوقات الدوام: يوميًا من 3 مساءً حتى 12 منتصف الليل.
- الخدمات: تأجير الدراجات النارية، التصليح، وقطع الغيار.

أسعار التأجير بالساعة:
- 50 سي سي: 80 درهم
- 90 سي سي: 150 درهم
- 220 سي سي: 200 درهم
- 400 سي سي: 250 درهم
- 800 سي سي فأعلى: 300 درهم

التصليح وقطع الغيار:
الأسعار تختلف حسب نوع العطل والقطعة والجودة وتكلفة التركيب.

تعليمات:
- أجب بالعربية الخليجية بشكل ودود ومختصر.
- إذا سأل عن سعر إيجار، أعطه السعر مباشرة.
- إذا سأل عن التصليح، اطلب نوع الدراجة ووصف العطل.
- إذا أراد الحجز، اطلب الاسم ورقم الهاتف.
- لا تخترع أي معلومات أو أسعار غير موجودة.
- إذا لم تتوفر المعلومة، أخبر العميل أن الفريق سيتواصل معه.
`;

const SYSTEM_PROMPT_EN = `
You are the AI assistant for First Bike motorcycle rental and repair shop in Al Ain, UAE.

Location:
Al Salamat, Al Heeba Street, next to 1 Million Cafe.

Opening hours:
Daily from 3 PM to midnight.

Hourly rental prices:
50cc: AED 80
90cc: AED 150
220cc: AED 200
400cc: AED 250
800cc and above: AED 300

Repair and spare part prices vary depending on the motorcycle,
problem, part quality and installation cost.

Instructions:
- Reply briefly and clearly in English.
- Give rental prices directly.
- For repairs, ask for motorcycle type and problem details.
- For bookings, ask for name and phone number.
- Never invent information or prices.
`;

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
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
  const result = await supabase(
    'clients?slug=eq.first-bike&select=id&limit=1'
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('First Bike client not found');
  }

  return result[0].id;
}

async function createOrGetConversation(clientId, sessionId) {
  const found = await supabase(
    `conversations?client_id=eq.${clientId}` +
    `&session_id=eq.${encodeURIComponent(sessionId)}` +
    `&select=id&limit=1`
  );

  if (Array.isArray(found) && found.length > 0) {
    return found[0].id;
  }

  const created = await supabase(
    'conversations?select=id',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        client_id: clientId,
        session_id: sessionId,
        status: 'open'
      })
    }
  );

  if (!Array.isArray(created) || !created[0]?.id) {
    throw new Error('Conversation creation failed');
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
  const value =
    typeof content === 'string'
      ? content
      : JSON.stringify(content);

  await supabase(
    'messages',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender,
        content: value,
        input_tokens: inputTokens,
        output_tokens: outputTokens
      })
    }
  );

  console.log(
    `Saved ${sender} message to conversation ${conversationId}`
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const language =
      body.language === 'en' ? 'en' : 'ar';

    const sessionId =
      body.session_id ||
      `firstbike-${randomUUID()}`;

    let conversationId = null;
    let userMessageSaved = false;
    let assistantMessageSaved = false;

    /*
     * 1. Create conversation
     * 2. Save latest user message
     */
    try {
      const clientId = await getClientId();

      conversationId =
        await createOrGetConversation(
          clientId,
          sessionId
        );

      const latestUserMessage =
        [...messages]
          .reverse()
          .find(
            item =>
              item &&
              item.role === 'user'
          );

      if (latestUserMessage?.content) {
        await saveMessage(
          conversationId,
          'user',
          latestUserMessage.content
        );

        userMessageSaved = true;
      }
    } catch (error) {
      console.error(
        'SUPABASE USER LOGGING ERROR:',
        error
      );
    }

    /*
     * Ask Anthropic
     */
    const anthropicResponse = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':
            process.env.ANTHROPIC_API_KEY,
          'anthropic-version':
            '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system:
            language === 'en'
              ? SYSTEM_PROMPT_EN
              : SYSTEM_PROMPT_AR,
          messages
        })
      }
    );

    const data =
      await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error(
        'ANTHROPIC ERROR:',
        data
      );

      return res
        .status(anthropicResponse.status)
        .json(data);
    }

    const assistantText =
      Array.isArray(data.content)
        ? data.content
            .filter(
              item =>
                item.type === 'text'
            )
            .map(item => item.text)
            .join('\n')
        : '';

    /*
     * Save assistant answer
     */
    if (
      conversationId &&
      assistantText
    ) {
      try {
        await saveMessage(
          conversationId,
          'assistant',
          assistantText,
          data.usage?.input_tokens ?? null,
          data.usage?.output_tokens ?? null
        );

        assistantMessageSaved = true;
      } catch (error) {
        console.error(
          'SUPABASE ASSISTANT LOGGING ERROR:',
          error
        );
      }
    }

    return res.status(200).json({
      ...data,

      novaire: {
        session_id: sessionId,
        conversation_id:
          conversationId,

        language,

        logging: {
          user:
            userMessageSaved,
          assistant:
            assistantMessageSaved
        }
      }
    });
  } catch (error) {
    console.error(
      'CHAT API ERROR:',
      error
    );

    return res.status(500).json({
      error: 'Server error'
    });
  }
};
