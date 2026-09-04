const { randomUUID } = require('crypto');

const SYSTEM_PROMPT_AR = `أنت مساعد ذكي لمحل "First Bike" لتأجير وتصليح الدراجات النارية في مدينة العين، الإمارات.

معلومات المحل:
- الموقع: العين، منطقة السلامات، شارع الهيبة، بجانب كافيه "1 مليون".
- أوقات الدوام: يوميًا من الساعة 3 العصر حتى 12 منتصف الليل.
- الخدمات: تأجير دراجات نارية بالساعة، تصليح دراجات، بيع قطع غيار.
- الإيجار يبدأ من المحل مباشرة إلى منطقة الرمل القريبة من المحل.

أسعار تأجير الدراجات (بالساعة):
- دراجة 50 سي سي: 80 درهم/ساعة
- دراجة 90 سي سي: 150 درهم/ساعة
- دراجة 220 سي سي: 200 درهم/ساعة
- دراجة 400 سي سي: 250 درهم/ساعة
- دراجة 800 سي سي فأعلى: 300 درهم/ساعة

قطع الغيار والتصليح:
الأسعار تختلف حسب نوع القطعة وجودتها وتكلفة التركيب، ولا يوجد سعر ثابت.
اطلب من العميل وصف العطل أو نوع الدراجة، وأخبره أن الفريق سيحدد السعر بدقة عند الحضور أو بعد وصف المشكلة بالتفصيل.

تعليمات الرد:
- رد بالعربية بلهجة خليجية ودودة ومباشرة، بحد أقصى 2-4 أسطر.
- إذا سأل عن سعر إيجار دراجة بسعة معينة، أجب بالسعر مباشرة من الجدول أعلاه.
- إذا سأل عن التصليح أو قطع الغيار، اشرح أن السعر يعتمد على الجودة والتركيب، واطلب تفاصيل العطل أو ادعه للحضور للمحل.
- إذا أراد الحجز أو الحضور، اطلب اسمه ورقم جواله وأخبره أن الفريق سيتواصل لتأكيد الموعد.
- لا تختلق معلومات أو أسعار غير مذكورة أعلاه.
- إذا سُئلت عن شيء خارج نطاق معلوماتك، اعتذر بلطف وأخبره أن الفريق سيرد عليه.`;

const SYSTEM_PROMPT_EN = `You are the AI assistant for "First Bike", a motorcycle rental and repair shop in Al Ain, UAE.

Business information:
- Location: Al Ain, Al Salamat area, Al Heeba Street, next to 1 Million Cafe.
- Opening hours: Daily from 3:00 PM to 12:00 midnight.
- Services: Hourly motorcycle rental, motorcycle repair, and spare parts.
- Rentals start directly from the shop to the nearby sand area.

Hourly rental prices:
- 50cc: AED 80/hour
- 90cc: AED 150/hour
- 220cc: AED 200/hour
- 400cc: AED 250/hour
- 800cc and above: AED 300/hour

Repairs and spare parts:
Prices vary depending on the part, quality and installation cost.
Ask the customer to describe the problem or motorcycle type. Explain that the team will confirm the exact price after inspecting it or receiving enough details.

Response instructions:
- Reply in friendly, clear English using 2-4 short lines.
- Give rental prices directly from the price list.
- For repairs or spare parts, explain that prices vary and ask for details.
- If the customer wants to book or visit, ask for their name and mobile number and explain that the team will contact them to confirm.
- Never invent information or prices.
- If the requested information is unavailable, politely explain that the team can assist further.`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase environment variables are missing');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function getFirstBikeClient() {
  const rows = await supabaseRequest(
    'clients?slug=eq.first-bike&select=id&limit=1'
  );

  if (!rows || !rows.length) {
    throw new Error('First Bike client was not found');
  }

  return rows[0].id;
}

async function getOrCreateConversation(clientId, sessionId) {
  const existing = await supabaseRequest(
    `conversations?client_id=eq.${encodeURIComponent(clientId)}&session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`
  );

  if (existing && existing.length) {
    return existing[0].id;
  }

  const created = await supabaseRequest('conversations', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      client_id: clientId,
      session_id: sessionId,
      status: 'open'
    })
  });

  return created[0].id;
}

async function saveMessage(conversationId, sender, content, usage = {}) {
  if (!content) return;

  await supabaseRequest('messages', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      sender,
      content,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      messages = [],
      session_id,
      language = 'ar'
    } = req.body || {};

    const activeSessionId = session_id || `legacy-${randomUUID()}`;

    let conversationId = null;

    try {
      const clientId = await getFirstBikeClient();

      conversationId = await getOrCreateConversation(
        clientId,
        activeSessionId
      );

      const latestUserMessage = [...messages]
        .reverse()
        .find(message => message.role === 'user');

      if (latestUserMessage?.content) {
        await saveMessage(
          conversationId,
          'user',
          latestUserMessage.content
        );
      }
    } catch (databaseError) {
      console.error('Supabase logging error:', databaseError);
    }

    const systemPrompt =
      language === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_AR;

    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const assistantText =
      data.content
        ?.filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n') || '';

    if (conversationId && assistantText) {
      try {
        await saveMessage(
          conversationId,
          'assistant',
          assistantText,
          {
            input_tokens: data.usage?.input_tokens,
            output_tokens: data.usage?.output_tokens
          }
        );
      } catch (databaseError) {
        console.error(
          'Supabase assistant logging error:',
          databaseError
        );
      }
    }

    return res.status(200).json({
      ...data,
      novaire: {
        conversation_id: conversationId,
        session_id: activeSessionId,
        language
      }
    });
  } catch (err) {
    console.error('Chat API error:', err);

    return res.status(500).json({
      error: 'Server error',
      details: String(err)
    });
  }
};
