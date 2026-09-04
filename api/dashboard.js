const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";

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
    throw new Error(text);
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

    if (!Array.isArray(summaryRows) || !summaryRows.length) {
      return res.status(404).json({
        error: "Client statistics not found"
      });
    }

    const clientId = summaryRows[0].client_id;

    const dailyRows = await supabaseRequest(
      `daily_dashboard_stats?client_id=eq.${clientId}&select=*&order=day.desc&limit=30`
    );

    return res.status(200).json({
      summary: summaryRows[0],
      daily: dailyRows
    });

  } catch (error) {
    console.error("DASHBOARD API ERROR:", error);

    return res.status(500).json({
      error: "Unable to load dashboard statistics"
    });
  }
};
