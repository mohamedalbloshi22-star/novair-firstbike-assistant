const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";

async function supabaseRequest(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: "Supabase environment variables are missing"
    });
  }

  try {
    const summaryRows = await supabaseRequest(
      `client_dashboard_stats?slug=eq.${encodeURIComponent(CLIENT_SLUG)}&select=*`
    );

    if (!Array.isArray(summaryRows) || summaryRows.length === 0) {
      return res.status(404).json({
        error: "Client statistics not found"
      });
    }

    const summary = summaryRows[0];
    const clientId = summary.client_id;

    const dailyRows = await supabaseRequest(
      `daily_dashboard_stats?client_id=eq.${clientId}&select=*&order=day.desc&limit=30`
    );

    const unansweredRows = await supabaseRequest(
      `unanswered_dashboard_stats?client_id=eq.${clientId}&select=*`
    );

    const recentUnanswered = await supabaseRequest(
      `unanswered_questions?client_id=eq.${clientId}&select=id,question,resolved,created_at&order=created_at.desc&limit=10`
    );

    const aiResolutionRows = await supabaseRequest(
      `ai_resolution_dashboard_stats?client_id=eq.${clientId}&select=*`
    );

    const languageRows = await supabaseRequest(
      `language_dashboard_stats?client_id=eq.${clientId}&select=*`
    );

    const commonQuestionsRows = await supabaseRequest(
      `common_questions_dashboard_stats?client_id=eq.${clientId}&select=question,times_asked,last_asked_at&order=times_asked.desc,last_asked_at.desc&limit=10`
    );

    const unanswered =
      Array.isArray(unansweredRows) && unansweredRows.length > 0
        ? unansweredRows[0]
        : {};

    const aiResolution =
      Array.isArray(aiResolutionRows) && aiResolutionRows.length > 0
        ? aiResolutionRows[0]
        : {};

    const languageStats =
      Array.isArray(languageRows) && languageRows.length > 0
        ? languageRows[0]
        : {};

    return res.status(200).json({
      summary: {
        ...summary,

        total_unanswered_questions:
          unanswered.total_unanswered_questions || 0,

        unresolved_unanswered_questions:
          unanswered.unresolved_unanswered_questions || 0,

        evaluated_conversations:
          aiResolution.evaluated_conversations || 0,

        ai_resolved_conversations:
          aiResolution.ai_resolved_conversations || 0,

        not_ai_resolved_conversations:
          aiResolution.not_ai_resolved_conversations || 0,

        ai_resolution_rate_percent:
          aiResolution.ai_resolution_rate_percent || 0,

        arabic_conversations:
          languageStats.arabic_conversations || 0,

        english_conversations:
          languageStats.english_conversations || 0,

        language_evaluated_conversations:
          languageStats.language_evaluated_conversations || 0,

        arabic_rate_percent:
          languageStats.arabic_rate_percent || 0,

        english_rate_percent:
          languageStats.english_rate_percent || 0
      },

      daily:
        Array.isArray(dailyRows)
          ? dailyRows
          : [],

      recent_unanswered_questions:
        Array.isArray(recentUnanswered)
          ? recentUnanswered
          : [],

      common_questions:
        Array.isArray(commonQuestionsRows)
          ? commonQuestionsRows
          : []
    });

  } catch (error) {
    console.error("DASHBOARD API ERROR:", error);

    return res.status(500).json({
      error: "Unable to load dashboard statistics",
      details: error.message
    });
  }
};
