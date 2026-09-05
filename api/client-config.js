const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function safeSlug(value) {
  return /^[a-z0-9_-]{2,80}$/.test(String(value || "").trim().toLowerCase());
}

async function getClient(slug) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,config&limit=1`,
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
    throw new Error(text || "Supabase request failed");
  }

  const rows = text ? JSON.parse(text) : [];

  return rows[0] || null;
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

  const slug = String(
    req.query.client || ""
  )
    .trim()
    .toLowerCase();

  if (!safeSlug(slug)) {
    return res.status(400).json({
      error: "Invalid client"
    });
  }

  try {
    const client = await getClient(slug);

    if (!client) {
      return res.status(404).json({
        error: "Client not found"
      });
    }

    const config = client.config || {};

    if (config.active === false) {
      return res.status(404).json({
        error: "Client inactive"
      });
    }

    const publicConfig = {
      id: client.id,
      slug: client.slug,
      name: client.name,

      brand_name:
        config.brand_name ||
        client.name ||
        client.slug,

      assistant_name_ar:
        config.assistant_name_ar ||
        "مساعد NOVAIRE",

      assistant_name_en:
        config.assistant_name_en ||
        "NOVAIRE Assistant",

      business_type_ar:
        config.business_type_ar ||
        "",

      business_type_en:
        config.business_type_en ||
        "",

      location_ar:
        config.location_ar ||
        "",

      location_en:
        config.location_en ||
        "",

      working_hours_ar:
        config.working_hours_ar ||
        "",

      working_hours_en:
        config.working_hours_en ||
        "",

      currency:
        config.currency ||
        "AED",

      rental_prices:
        Array.isArray(config.rental_prices)
          ? config.rental_prices
          : [],

      services_ar:
        Array.isArray(config.services_ar)
          ? config.services_ar
          : [],

      services_en:
        Array.isArray(config.services_en)
          ? config.services_en
          : [],

      notes_ar:
        config.notes_ar ||
        "",

      notes_en:
        config.notes_en ||
        "",

      default_language:
        config.default_language ||
        "ar",

      active:
        config.active !== false
    };

    res.setHeader(
      "Cache-Control",
      "public, max-age=60, s-maxage=60"
    );

    return res.status(200).json({
      success: true,
      client: publicConfig
    });

  } catch (error) {
    console.error(
      "client-config error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to load client configuration"
    });
  }
};
