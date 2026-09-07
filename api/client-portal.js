const { getClientSession } = require("./_client-session");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function db(path) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const session = getClientSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const clientId = session.client_id;
    const encodedId = encodeURIComponent(clientId);

    const [
      clients,
      conversations,
      contacts,
      unanswered
    ] = await Promise.all([
      db(
        `clients?id=eq.${encodedId}&select=id,name,slug,config`
      ),

      db(
        `conversations?client_id=eq.${encodedId}&select=id,started_at,status,resolved_by_ai,human_handoff,callback_requested,language&order=started_at.desc&limit=5000`
      ),

      db(
        `contact_requests?client_id=eq.${encodedId}&select=id,request_type,customer_name,phone,reason,status,created_at&order=created_at.desc&limit=100`
      ),

      db(
        `unanswered_questions?client_id=eq.${encodedId}&select=id,question,created_at,resolved&order=created_at.desc&limit=100`
      )
    ]);

    if (!clients || clients.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Client not found"
      });
    }

    const client = clients[0];

    const total = conversations.length;

    const aiResolved = conversations.filter(
      item => item.resolved_by_ai === true
    ).length;

    const aiRate =
      total > 0
        ? Math.round((aiResolved / total) * 100)
        : 0;

    const handoffs = conversations.filter(
      item => item.human_handoff === true
    ).length;

    const callbacks = conversations.filter(
      item => item.callback_requested === true
    ).length;

    const openUnanswered = unanswered.filter(
      item => item.resolved !== true
    ).length;

    const arabic = conversations.filter(
      item => item.language === "ar"
    ).length;

    const english = conversations.filter(
      item => item.language === "en"
    ).length;

    const languageTotal = arabic + english;

    const arabicPercent =
      languageTotal > 0
        ? Math.round((arabic / languageTotal) * 100)
        : 0;

    const englishPercent =
      languageTotal > 0
        ? Math.round((english / languageTotal) * 100)
        : 0;

    const hourMap = {};

    for (const conversation of conversations) {
      if (!conversation.started_at) continue;

      const hour = new Intl.DateTimeFormat(
        "en-US",
        {
          hour: "2-digit",
          hour12: false,
          timeZone: "Asia/Dubai"
        }
      ).format(
        new Date(conversation.started_at)
      );

      hourMap[hour] =
        (hourMap[hour] || 0) + 1;
    }

    const peakHours = Object.entries(hourMap)
      .map(([hour, count]) => ({
        hour,
        conversations: count
      }))
      .sort(
        (a, b) =>
          b.conversations - a.conversations
      )
      .slice(0, 5);

    const dailyMap = {};

    for (const conversation of conversations) {
      if (!conversation.started_at) continue;

      const date = new Date(
        conversation.started_at
      )
        .toISOString()
        .slice(0, 10);

      dailyMap[date] =
        (dailyMap[date] || 0) + 1;
    }

    const dailyStats = Object.entries(dailyMap)
      .map(([date, count]) => ({
        date,
        conversations: count
      }))
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date)
      )
      .slice(0, 30);

    return res.status(200).json({
      success: true,

      client: {
        name:
          client.config?.brand_name ||
          client.name,
        slug: client.slug
      },

      stats: {
        total_conversations: total,
        contact_requests: contacts.length,
        ai_resolution_rate: aiRate,
        unanswered_questions: openUnanswered,
        human_handoffs: handoffs,
        callback_requests: callbacks
      },

      languages: {
        arabic,
        english,
        arabic_percent: arabicPercent,
        english_percent: englishPercent
      },

      peak_hours: peakHours,
      daily_stats: dailyStats,

      recent_contacts: contacts.slice(0, 20),
      recent_unanswered: unanswered.slice(0, 20)
    });

  } catch (error) {
    console.error("CLIENT PORTAL ERROR", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};
