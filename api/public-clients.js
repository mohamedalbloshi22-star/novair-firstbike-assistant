const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getClients() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/clients?select=id,name,slug,config&order=created_at.asc`,
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
      error: "Missing Supabase configuration"
    });
  }

  try {

    const rows = await getClients();

    const clients = rows
      .filter(client => client && client.slug)
      .map(client => ({
        id: client.id,
        slug: client.slug,
        name:
          client.config?.brand_name ||
          client.name ||
          client.slug,
        active:
          client.config?.active !== false
      }))
      .filter(client => client.active);

    res.setHeader(
      "Cache-Control",
      "no-store, max-age=0"
    );

    return res.status(200).json({
      success: true,
      clients
    });

  } catch (error) {

    console.error(
      "public-clients error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to load clients"
    });
  }
};
