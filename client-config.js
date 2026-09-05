const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


/*
==================================================
Supabase
==================================================
*/

async function supabaseRequest(path) {

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        headers: {
          apikey:
            SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          "Content-Type":
            "application/json"
        }
      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Supabase error ${response.status}: ${text}`
    );
  }

  return text
    ? JSON.parse(text)
    : null;
}


/*
==================================================
Slug validation
==================================================
*/

function normalizeClientSlug(value) {

  const slug =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9_-]{2,80}$/.test(slug)
  ) {
    return "";
  }

  return slug;
}


/*
==================================================
Handler
==================================================
*/

module.exports =
async function handler(req, res) {

  /*
  ----------------------------------------------
  Only GET
  ----------------------------------------------
  */

  if (req.method !== "GET") {

    return res.status(405).json({
      error:
        "Method not allowed"
    });
  }


  /*
  ----------------------------------------------
  Environment
  ----------------------------------------------
  */

  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {

    return res.status(500).json({
      error:
        "Server configuration error"
    });
  }


  try {

    /*
    --------------------------------------------
    Client slug
    --------------------------------------------
    */

    const clientSlug =
      normalizeClientSlug(
        req.query?.client
      );

    if (!clientSlug) {

      return res.status(400).json({
        error:
          "Valid client is required"
      });
    }


    /*
    --------------------------------------------
    Get client
    --------------------------------------------
    */

    const rows =
      await supabaseRequest(
        `clients` +
        `?slug=eq.${encodeURIComponent(clientSlug)}` +
        `&select=id,name,slug,config` +
        `&limit=1`
      );


    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      return res.status(404).json({
        error:
          "Client not found"
      });
    }


    const client =
      rows[0];

    const config =
      client.config &&
      typeof client.config === "object"

        ? client.config

        : {};


    /*
    --------------------------------------------
    Inactive client
    --------------------------------------------
    */

    if (config.active === false) {

      return res.status(404).json({
        error:
          "Client not available"
      });
    }


    /*
    --------------------------------------------
    Public configuration only
    --------------------------------------------

    IMPORTANT:
    We intentionally return only public
    customer-facing information.

    No Supabase keys.
    No admin password.
    No internal analytics.
    No private customer data.
    --------------------------------------------
    */

    const publicConfig = {

      slug:
        client.slug,

      name:
        String(
          config.brand_name ||
          client.name ||
          ""
        ).trim(),

      assistant_name_ar:
        String(
          config.assistant_name_ar ||
          ""
        ).trim(),

      assistant_name_en:
        String(
          config.assistant_name_en ||
          ""
        ).trim(),

      business_type_ar:
        String(
          config.business_type_ar ||
          ""
        ).trim(),

      business_type_en:
        String(
          config.business_type_en ||
          ""
        ).trim(),

      location_ar:
        String(
          config.location_ar ||
          ""
        ).trim(),

      location_en:
        String(
          config.location_en ||
          ""
        ).trim(),

      working_hours_ar:
        String(
          config.working_hours_ar ||
          ""
        ).trim(),

      working_hours_en:
        String(
          config.working_hours_en ||
          ""
        ).trim(),

      services_ar:
        Array.isArray(
          config.services_ar
        )
          ? config.services_ar
          : [],

      services_en:
        Array.isArray(
          config.services_en
        )
          ? config.services_en
          : [],

      rental_prices:
        Array.isArray(
          config.rental_prices
        )
          ? config.rental_prices
          : [],

      notes_ar:
        String(
          config.notes_ar ||
          ""
        ).trim(),

      notes_en:
        String(
          config.notes_en ||
          ""
        ).trim(),

      welcome_message_ar:
        String(
          config.welcome_message_ar ||
          ""
        ).trim(),

      welcome_message_en:
        String(
          config.welcome_message_en ||
          ""
        ).trim(),

      default_language:
        config.default_language === "en"
          ? "en"
          : "ar"
    };


    /*
    --------------------------------------------
    Cache

    Short cache only.
    This keeps loading fast while allowing
    admin changes to appear quickly.
    --------------------------------------------
    */

    res.setHeader(
      "Cache-Control",
      "public, max-age=60, s-maxage=60"
    );


    return res.status(200).json({
      success: true,
      client:
        publicConfig
    });


  } catch (error) {

    console.error(
      "CLIENT CONFIG ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to load client configuration"
    });
  }
};
