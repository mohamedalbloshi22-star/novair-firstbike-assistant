const { getClientSession } = require("./_client-session");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabase(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Supabase request failed");
  }

  return response.json();
}

function countBy(items, field, value) {
  return items.filter(item => item[field] === value).length;
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

    const [
      clients,
      conversations,
      contactRequests,
      unanswered,
      messages
    ] = await Promise.all([
      supabase(
        `clients?id=eq.${encodeURIComponent(clientId)}&select=id,name,slug,config`
      ),

      supabase(
        `conversations?client_id=eq.${encodeURIComponent(clientId)}&select=id,started_at,status,resolved_by_ai,human_handoff,callback_requested,language&order=started_at.desc&limit=5000`
      ),

      supabase(
        `contact_requests?client_id=eq.${encodeURIComponent(clientId)}&select=id,request_type,customer_name,phone,reason,status,created_at&order=created_at.desc&limit=100`
      ),

      supabase(
        `unanswered_questions?client_id=eq.${encodeURIComponent(clientId)}&select=id,question,created_at,resolved&order=created_at.desc&limit=100`
      ),

      supabase(
        `messages?conversation_id=in.(${encodeURIComponent(
          conversationsPlaceholder()
        )})&select=id`
      ).catch(() => [])
    ]);

    if (!clients.length) {
      return res.status(404).json({
        success: false,
        error: "Client not found"
      });
    }

    const client = clients[0];

    const totalConversations = conversations.length;

    const aiResolved =
      conversations.filter(
        c => c.resolved_by_ai === true
      ).length;

    const aiResolutionRate =
      totalConversations > 0
        ? Math.round(
            (aiResolved / totalConversations) * 100
          )
        : 0;

    const humanHandoffs =
      countBy(
        conversations,
        "human_handoff",
        true
      );

    const callbacks =
      countBy(
        conversations,
        "callback_requested",
        true
      );

    const openUnanswered =
      unanswered.filter(
        q => q.resolved !== true
      ).length;

    const arabic =
      conversations.filter(
        c => c.language === "ar"
      ).length;

    const english =
      conversations.filter(
        c => c.language === "en"
      ).length;

    const languageTotal =
      arabic + english;

    const languages = {
      arabic,
      english,
      arabic_percent:
        languageTotal > 0
          ? Math.round(
              (arabic / languageTotal) * 100
            )
          : 0,
      english_percent:
        languageTotal > 0
          ? Math.round(
              (english / languageTotal) * 100
            )
          : 0
    };

    const dailyMap = {};

    for (const c of conversations) {
      if (!c.started_at) continue;

      const date =
        new Date(c.started_at)
          .toISOString()
          .slice(0, 10);

      dailyMap[date] =
        (dailyMap[date] || 0) + 1;
    }

    const dailyStats =
      Object.entries(dailyMap)
        .map(([date, count]) => ({
          date,
          conversations: count
        }))
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date)
        )
        .slice(0, 30);

    const hourMap = {};

    for (const c of conversations) {
      if (!c.started_at) continue;

      const date =
        new Date(c.started_at);

      const hour =
        new Intl.DateTimeFormat(
          "en-US",
          {
            hour: "2-digit",
            hour12: false,
            timeZone: "Asia/Dubai"
          }
        ).format(date);

      hourMap[hour] =
        (hourMap[hour] || 0) + 1;
    }

    const peakHours =
      Object.entries(hourMap)
        .map(([hour, count]) => ({
          hour,
          conversations: count
        }))
        .sort(
          (a, b) =>
            b.conversations -
            a.conversations
        )
        .slice(0, 5);

    return res.status(200).json({
      success: true,

      client: {
        name:
          client.config?.brand_name ||
          client.name,
        slug: client.slug
      },

      stats: {
        total_conversations:
          totalConversations,

        contact_requests:
          contactRequests.length,

        ai_resolution_rate:
          aiResolutionRate,

        unanswered_questions:
          openUnanswered,

        human_handoffs:
          humanHandoffs,

        callback_requests:
          callbacks
      },

      languages,

      peak_hours: peakHours,

      daily_stats: dailyStats,

      recent_contacts:
        contactRequests.slice(0, 20),

      recent_unanswered:
        unanswered.slice(0, 20)
    });

  } catch (error) {
    console.error(
      "Client portal error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

function conversationsPlaceholder() {
  return "00000000-0000-0000-0000-000000000000";
}
