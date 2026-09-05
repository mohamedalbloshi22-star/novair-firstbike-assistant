const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;

async function supabaseRequest(path) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase error ${response.status}: ${text}`
    );
  }

  return text ? JSON.parse(text) : [];
}

function safeSlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_-]{2,80}$/.test(slug)) {
    return null;
  }

  return slug;
}

function percentage(part, total) {
  if (!total) return 0;

  return Number(
    ((part / total) * 100).toFixed(1)
  );
}

function uaeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(date);
}

function uaeHour(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        hour12: false
      }
    ).format(date)
  );
}

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
      error: "Server configuration missing"
    });
  }

  /*
    حماية لوحة الإحصائيات
  */

  const password = String(
    req.body?.password || ""
  );

  if (
    !password ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {

    const clientSlug = safeSlug(
      req.body?.client_slug ||
      req.body?.client
    );

    if (!clientSlug) {
      return res.status(400).json({
        error: "Valid client is required"
      });
    }

    /*
      1. العميل
    */

    const clients = await supabaseRequest(
      `clients?slug=eq.${encodeURIComponent(clientSlug)}` +
      `&select=id,name,slug,config` +
      `&limit=1`
    );

    if (
      !Array.isArray(clients) ||
      clients.length === 0
    ) {
      return res.status(404).json({
        error: "Client not found"
      });
    }

    const client = clients[0];

    if (
      client.config &&
      client.config.active === false
    ) {
      return res.status(403).json({
        error: "Client inactive"
      });
    }

    /*
      2. المحادثات
    */

    const conversations =
      await supabaseRequest(
        `conversations?client_id=eq.${client.id}` +
        `&select=id,started_at,created_at,language,resolved_by_ai,human_handoff,callback_requested`
      );

    const conversationIds =
      conversations.map(row => row.id);

    /*
      3. الرسائل
    */

    let messages = [];

    if (conversationIds.length > 0) {

      const ids = conversationIds
        .map(id => `"${id}"`)
        .join(",");

      messages = await supabaseRequest(
        `messages?conversation_id=in.(${encodeURIComponent(ids)})` +
        `&select=id,conversation_id,sender,content,created_at`
      );
    }

    /*
      4. طلبات التواصل
    */

    const contactRequests =
      await supabaseRequest(
        `contact_requests?client_id=eq.${client.id}` +
        `&select=id,request_type,status,created_at`
      );

    /*
      5. الأسئلة غير المجابة
    */

    const unansweredQuestions =
      await supabaseRequest(
        `unanswered_questions?client_id=eq.${client.id}` +
        `&resolved=eq.false` +
        `&select=id,question,created_at`
      );

    /*
      الملخص
    */

    const totalConversations =
      conversations.length;

    const totalMessages =
      messages.length;

    const aiResolved =
      conversations.filter(
        row => row.resolved_by_ai === true
      ).length;

    const handoffCount =
      conversations.filter(
        row => row.human_handoff === true
      ).length;

    const callbackCount =
      conversations.filter(
        row => row.callback_requested === true
      ).length;

    /*
      اللغات
    */

    const arabicCount =
      conversations.filter(
        row => row.language === "ar"
      ).length;

    const englishCount =
      conversations.filter(
        row => row.language === "en"
      ).length;

    /*
      الأسئلة الأكثر شيوعًا
    */

    const questionMap = {};

    messages
      .filter(
        row =>
          row.sender === "user" &&
          row.content
      )
      .forEach(row => {

        const question =
          String(row.content)
            .trim()
            .replace(/\s+/g, " ");

        if (!question) return;

        const key =
          question.toLowerCase();

        if (!questionMap[key]) {
          questionMap[key] = {
            question,
            count: 0
          };
        }

        questionMap[key].count += 1;
      });

    const commonQuestions =
      Object.values(questionMap)
        .sort(
          (a, b) =>
            b.count - a.count
        )
        .slice(0, 10);

    /*
      أوقات الذروة بتوقيت الإمارات
    */

    const hourMap = {};

    conversations.forEach(row => {

      const hour = uaeHour(
        row.started_at ||
        row.created_at
      );

      if (
        hour === null ||
        Number.isNaN(hour)
      ) {
        return;
      }

      hourMap[hour] =
        (hourMap[hour] || 0) + 1;
    });

    const peakHours =
      Object.entries(hourMap)
        .map(([hour, count]) => ({
          hour: Number(hour),
          count
        }))
        .sort(
          (a, b) =>
            b.count - a.count
        );

    /*
      الإحصائيات اليومية
    */

    const dailyMap = {};

    conversations.forEach(row => {

      const day = uaeDate(
        row.started_at ||
        row.created_at
      );

      if (!day) return;

      if (!dailyMap[day]) {
        dailyMap[day] = {
          date: day,
          conversations: 0,
          messages: 0
        };
      }

      dailyMap[day].conversations += 1;
    });

    messages.forEach(row => {

      const day =
        uaeDate(row.created_at);

      if (!day) return;

      if (!dailyMap[day]) {
        dailyMap[day] = {
          date: day,
          conversations: 0,
          messages: 0
        };
      }

      dailyMap[day].messages += 1;
    });

    const dailyStats =
      Object.values(dailyMap)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date)
        )
        .slice(0, 30);

    /*
      منع التخزين المؤقت
    */

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    /*
      النتيجة
    */

    return res.status(200).json({

      client: {
        id: client.id,
        slug: client.slug,
        name:
          client.config?.brand_name ||
          client.name ||
          client.slug
      },

      summary: {

        total_conversations:
          totalConversations,

        total_messages:
          totalMessages,

        ai_resolution_rate:
          percentage(
            aiResolved,
            totalConversations
          ),

        unanswered_questions:
          unansweredQuestions.length,

        human_handoff:
          handoffCount,

        callback_requested:
          callbackCount,

        total_contact_requests:
          contactRequests.length,

        callback_rate_percent:
          percentage(
            callbackCount,
            totalConversations
          ),

        human_handoff_rate_percent:
          percentage(
            handoffCount,
            totalConversations
          )
      },

      languages: {
        ar: arabicCount,
        en: englishCount
      },

      common_questions:
        commonQuestions,

      peak_hours:
        peakHours,

      daily_stats:
        dailyStats
    });

  } catch (error) {

    console.error(
      "DASHBOARD API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to load dashboard data"
    });
  }
};
