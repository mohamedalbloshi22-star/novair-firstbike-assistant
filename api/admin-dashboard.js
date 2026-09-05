const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;

const AI_MODEL_NAME = "Claude Sonnet 4.6";
const INPUT_PRICE_PER_MILLION = 3;
const OUTPUT_PRICE_PER_MILLION = 15;
const AED_PER_USD = 3.6725;

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

function safeSlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_-]{2,80}$/.test(slug)) {
    return null;
  }

  return slug;
}

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_PASSWORD) {
    return res.status(500).json({
      error: "Server configuration is incomplete"
    });
  }

  const suppliedPassword =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!suppliedPassword || suppliedPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const clientSlug = safeSlug(
    req.body?.client_slug ||
    req.body?.client
  );

  if (!clientSlug) {
    return res.status(400).json({
      error: "Valid client_slug is required"
    });
  }

  try {

    const summaryRows = await supabaseRequest(
      `client_dashboard_stats?slug=eq.${encodeURIComponent(clientSlug)}&select=*`
    );

    if (!Array.isArray(summaryRows) || summaryRows.length === 0) {
      return res.status(404).json({
        error: "Client statistics not found"
      });
    }

    const summary = summaryRows[0];
    const clientId = summary.client_id;

    const [
      unansweredRows,
      aiResolutionRows,
      languageRows,
      aiUsageRows
    ] = await Promise.all([

      supabaseRequest(
        `unanswered_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`
      ),

      supabaseRequest(
        `ai_resolution_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`
      ),

      supabaseRequest(
        `language_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`
      ),

      supabaseRequest(
        `ai_usage_dashboard_stats?client_id=eq.${encodeURIComponent(clientId)}&select=*`
      )
    ]);

    const unanswered =
      Array.isArray(unansweredRows) && unansweredRows.length
        ? unansweredRows[0]
        : {};

    const aiResolution =
      Array.isArray(aiResolutionRows) && aiResolutionRows.length
        ? aiResolutionRows[0]
        : {};

    const languageStats =
      Array.isArray(languageRows) && languageRows.length
        ? languageRows[0]
        : {};

    const aiUsage =
      Array.isArray(aiUsageRows) && aiUsageRows.length
        ? aiUsageRows[0]
        : {};

    const totalInputTokens =
      Number(aiUsage.total_input_tokens || 0);

    const totalOutputTokens =
      Number(aiUsage.total_output_tokens || 0);

    const totalTokens =
      Number(
        aiUsage.total_tokens ||
        totalInputTokens + totalOutputTokens
      );

    const inputCostUsd =
      (totalInputTokens / 1000000) *
      INPUT_PRICE_PER_MILLION;

    const outputCostUsd =
      (totalOutputTokens / 1000000) *
      OUTPUT_PRICE_PER_MILLION;

    const totalCostUsd =
      inputCostUsd + outputCostUsd;

    const totalCostAed =
      totalCostUsd * AED_PER_USD;

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    return res.status(200).json({

      client: {
        client_id: summary.client_id,
        client_name: summary.client_name,
        slug: summary.slug
      },

      operations: {

        total_conversations:
          Number(summary.total_conversations || 0),

        total_messages:
          Number(summary.total_messages || 0),

        total_contact_requests:
          Number(summary.total_contact_requests || 0),

        callback_requests:
          Number(summary.callback_requests || 0),

        human_handoff_requests:
          Number(summary.human_handoff_requests || 0),

        total_unanswered_questions:
          Number(unanswered.total_unanswered_questions || 0),

        unresolved_unanswered_questions:
          Number(unanswered.unresolved_unanswered_questions || 0),

        ai_resolution_rate_percent:
          Number(aiResolution.ai_resolution_rate_percent || 0),

        arabic_conversations:
          Number(languageStats.arabic_conversations || 0),

        english_conversations:
          Number(languageStats.english_conversations || 0)
      },

      ai_usage: {

        model: AI_MODEL_NAME,

        total_input_tokens:
          totalInputTokens,

        total_output_tokens:
          totalOutputTokens,

        total_tokens:
          totalTokens,

        ai_usage_records:
          Number(aiUsage.ai_usage_records || 0),

        input_price_per_million_usd:
          INPUT_PRICE_PER_MILLION,

        output_price_per_million_usd:
          OUTPUT_PRICE_PER_MILLION,

        input_cost_usd:
          Number(inputCostUsd.toFixed(6)),

        output_cost_usd:
          Number(outputCostUsd.toFixed(6)),

        total_cost_usd:
          Number(totalCostUsd.toFixed(6)),

        total_cost_aed:
          Number(totalCostAed.toFixed(4))
      }
    });

  } catch (error) {

    console.error(
      "ADMIN DASHBOARD API ERROR:",
      error
    );

    return res.status(500).json({
      error: "Unable to load admin dashboard statistics"
    });
  }
};
