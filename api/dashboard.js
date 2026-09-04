const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";

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

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/client_dashboard_stats?slug=eq.${encodeURIComponent(CLIENT_SLUG)}&select=*`,
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
      console.error("SUPABASE DASHBOARD ERROR:", text);

      return res.status(500).json({
        error: "Unable to load dashboard statistics"
      });
    }

    const rows = text ? JSON.parse(text) : [];

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({
        error: "Client statistics not found"
      });
    }

    return res.status(200).json(rows[0]);

  } catch (error) {

    console.error("DASHBOARD API ERROR:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};
