const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      `Supabase ${response.status}: ${text}`
    );
  }

  return text
    ? JSON.parse(text)
    : [];
}


module.exports = async function handler(req, res) {

  if (req.method !== "GET") {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  if (!SUPABASE_URL || !SUPABASE_KEY) {

    return res.status(500).json({
      error: "Server configuration is incomplete"
    });

  }


  try {

    const rows = await supabaseRequest(
      "clients?select=id,name,slug,config&order=created_at.asc"
    );


    const clients =
      (Array.isArray(rows) ? rows : [])

      .filter(function(client) {

        return (
          client &&
          client.slug &&
          client.config?.active !== false
        );

      })

      .map(function(client) {

        return {
          id: client.id,
          slug: client.slug,
          name:
            client.name ||
            client.config?.brand_name ||
            client.slug,
          brand_name:
            client.config?.brand_name ||
            client.name ||
            client.slug
        };

      });


    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );


    return res.status(200).json({
      clients
    });


  } catch (error) {

    console.error(
      "PUBLIC CLIENTS API ERROR:",
      error
    );


    return res.status(500).json({
      error: "Unable to load clients"
    });

  }

};
