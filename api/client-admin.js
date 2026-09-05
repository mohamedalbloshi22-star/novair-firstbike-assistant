const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_PASSWORD =
  process.env.NOVAIRE_ADMIN_PASSWORD;


/*
==================================================
Supabase
==================================================
*/

async function supabaseRequest(
  path,
  options = {}
) {

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        method:
          options.method || "GET",

        headers: {
          apikey:
            SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          "Content-Type":
            "application/json",

          ...(options.prefer
            ? {
                Prefer:
                  options.prefer
              }
            : {})
        },

        body:
          options.body
            ? JSON.stringify(
                options.body
              )
            : undefined
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
Helpers
==================================================
*/

function cleanText(value) {

  return String(
    value || ""
  ).trim();
}


function normalizeSlug(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(
      /[^a-z0-9_-]/g,
      ""
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}


function normalizeLanguage(value) {

  return value === "en"
    ? "en"
    : "ar";
}


function normalizeArray(value) {

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      item =>
        cleanText(item)
    )
    .filter(Boolean);
}


function normalizePrices(value) {

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      item => {

        if (
          !item ||
          typeof item !== "object"
        ) {
          return null;
        }

        const label =
          cleanText(
            item.label
          );

        const price =
          Number(
            item.price
          );

        const unitAr =
          cleanText(
            item.unit_ar
          );

        const unitEn =
          cleanText(
            item.unit_en
          );

        if (
          !label ||
          !Number.isFinite(price)
        ) {
          return null;
        }

        return {
          label,
          price,
          unit_ar:
            unitAr,
          unit_en:
            unitEn
        };
      }
    )
    .filter(Boolean);
}


/*
==================================================
Password
==================================================
*/

function isAuthorized(body) {

  const password =
    cleanText(
      body?.password
    );

  if (
    !ADMIN_PASSWORD ||
    !password
  ) {
    return false;
  }

  return password ===
    ADMIN_PASSWORD;
}


/*
==================================================
List clients
==================================================
*/

async function listClients() {

  const rows =
    await supabaseRequest(
      `clients` +
      `?select=id,name,slug,config,created_at` +
      `&order=created_at.desc`
    );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(
    row => {

      const config =
        row.config &&
        typeof row.config ===
        "object"
          ? row.config
          : {};

      return {
        id:
          row.id,

        name:
          row.name,

        slug:
          row.slug,

        created_at:
          row.created_at,

        active:
          config.active !== false,

        business_type_ar:
          cleanText(
            config.business_type_ar
          ),

        business_type_en:
          cleanText(
            config.business_type_en
          ),

        location_ar:
          cleanText(
            config.location_ar
          ),

        location_en:
          cleanText(
            config.location_en
          )
      };
    }
  );
}


/*
==================================================
Get one client
==================================================
*/

async function getClient(
  clientId
) {

  const rows =
    await supabaseRequest(
      `clients` +
      `?id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,name,slug,config,created_at` +
      `&limit=1`
    );

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return null;
  }

  return rows[0];
}


/*
==================================================
Create client
==================================================
*/

async function createClient(
  body
) {

  const name =
    cleanText(
      body.name
    );

  const slug =
    normalizeSlug(
      body.slug
    );

  if (!name) {

    return {
      status: 400,
      data: {
        error:
          "Client name is required"
      }
    };
  }

  if (
    !slug ||
    slug.length < 2 ||
    slug.length > 80
  ) {

    return {
      status: 400,
      data: {
        error:
          "Valid slug is required"
      }
    };
  }


  /*
  ----------------------------------------------
  Check slug duplication
  ----------------------------------------------
  */

  const existing =
    await supabaseRequest(
      `clients` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&select=id,slug` +
      `&limit=1`
    );


  if (
    Array.isArray(existing) &&
    existing.length > 0
  ) {

    return {
      status: 409,
      data: {
        error:
          "Client slug already exists"
      }
    };
  }


  /*
  ----------------------------------------------
  Config
  ----------------------------------------------
  */

  const config = {

    brand_name:
      cleanText(
        body.brand_name
      ) || name,

    assistant_name_ar:
      cleanText(
        body.assistant_name_ar
      ),

    assistant_name_en:
      cleanText(
        body.assistant_name_en
      ),

    business_type_ar:
      cleanText(
        body.business_type_ar
      ),

    business_type_en:
      cleanText(
        body.business_type_en
      ),

    location_ar:
      cleanText(
        body.location_ar
      ),

    location_en:
      cleanText(
        body.location_en
      ),

    working_hours_ar:
      cleanText(
        body.working_hours_ar
      ),

    working_hours_en:
      cleanText(
        body.working_hours_en
      ),

    services_ar:
      normalizeArray(
        body.services_ar
      ),

    services_en:
      normalizeArray(
        body.services_en
      ),

    rental_prices:
      normalizePrices(
        body.rental_prices
      ),

    notes_ar:
      cleanText(
        body.notes_ar
      ),

    notes_en:
      cleanText(
        body.notes_en
      ),

    welcome_message_ar:
      cleanText(
        body.welcome_message_ar
      ),

    welcome_message_en:
      cleanText(
        body.welcome_message_en
      ),

    default_language:
      normalizeLanguage(
        body.default_language
      ),

    active:
      body.active !== false
  };


  const created =
    await supabaseRequest(
      "clients",
      {
        method:
          "POST",

        prefer:
          "return=representation",

        body: {
          name,
          slug,
          config
        }
      }
    );


  if (
    !Array.isArray(created) ||
    created.length === 0
  ) {

    throw new Error(
      "Client creation failed"
    );
  }


  return {
    status: 201,

    data: {
      success: true,

      client:
        created[0]
    }
  };
}


/*
==================================================
Update client
==================================================
*/

async function updateClient(
  body
) {

  const clientId =
    cleanText(
      body.client_id
    );

  if (!clientId) {

    return {
      status: 400,
      data: {
        error:
          "client_id is required"
      }
    };
  }


  const existing =
    await getClient(
      clientId
    );

  if (!existing) {

    return {
      status: 404,
      data: {
        error:
          "Client not found"
      }
    };
  }


  const existingConfig =
    existing.config &&
    typeof existing.config ===
    "object"
      ? existing.config
      : {};


  const name =
    cleanText(
      body.name
    ) ||
    existing.name;


  const slug =
    normalizeSlug(
      body.slug
    ) ||
    existing.slug;


  /*
  ----------------------------------------------
  Check slug duplicate if changed
  ----------------------------------------------
  */

  if (
    slug !== existing.slug
  ) {

    const duplicate =
      await supabaseRequest(
        `clients` +
        `?slug=eq.${encodeURIComponent(slug)}` +
        `&id=neq.${encodeURIComponent(clientId)}` +
        `&select=id` +
        `&limit=1`
      );


    if (
      Array.isArray(duplicate) &&
      duplicate.length > 0
    ) {

      return {
        status: 409,
        data: {
          error:
            "Client slug already exists"
        }
      };
    }
  }


  const config = {

    ...existingConfig,

    brand_name:
      cleanText(
        body.brand_name
      ) ||
      name,

    assistant_name_ar:
      cleanText(
        body.assistant_name_ar
      ),

    assistant_name_en:
      cleanText(
        body.assistant_name_en
      ),

    business_type_ar:
      cleanText(
        body.business_type_ar
      ),

    business_type_en:
      cleanText(
        body.business_type_en
      ),

    location_ar:
      cleanText(
        body.location_ar
      ),

    location_en:
      cleanText(
        body.location_en
      ),

    working_hours_ar:
      cleanText(
        body.working_hours_ar
      ),

    working_hours_en:
      cleanText(
        body.working_hours_en
      ),

    services_ar:
      normalizeArray(
        body.services_ar
      ),

    services_en:
      normalizeArray(
        body.services_en
      ),

    rental_prices:
      normalizePrices(
        body.rental_prices
      ),

    notes_ar:
      cleanText(
        body.notes_ar
      ),

    notes_en:
      cleanText(
        body.notes_en
      ),

    welcome_message_ar:
      cleanText(
        body.welcome_message_ar
      ),

    welcome_message_en:
      cleanText(
        body.welcome_message_en
      ),

    default_language:
      normalizeLanguage(
        body.default_language
      ),

    active:
      body.active !== false
  };


  const updated =
    await supabaseRequest(
      `clients?id=eq.${encodeURIComponent(clientId)}`,
      {
        method:
          "PATCH",

        prefer:
          "return=representation",

        body: {
          name,
          slug,
          config
        }
      }
    );


  return {
    status: 200,

    data: {
      success: true,

      client:
        Array.isArray(updated)
          ? updated[0]
          : null
    }
  };
}


/*
==================================================
Toggle active
==================================================
*/

async function toggleClient(
  body
) {

  const clientId =
    cleanText(
      body.client_id
    );

  if (!clientId) {

    return {
      status: 400,
      data: {
        error:
          "client_id is required"
      }
    };
  }


  const client =
    await getClient(
      clientId
    );

  if (!client) {

    return {
      status: 404,
      data: {
        error:
          "Client not found"
      }
    };
  }


  const config =
    client.config &&
    typeof client.config ===
    "object"
      ? client.config
      : {};


  const nextActive =
    config.active === false;


  const updatedConfig = {
    ...config,
    active:
      nextActive
  };


  await supabaseRequest(
    `clients?id=eq.${encodeURIComponent(clientId)}`,
    {
      method:
        "PATCH",

      prefer:
        "return=minimal",

      body: {
        config:
          updatedConfig
      }
    }
  );


  return {
    status: 200,

    data: {
      success: true,
      active:
        nextActive
    }
  };
}


/*
==================================================
Delete client
==================================================
*/

async function deleteClient(
  body
) {

  const clientId =
    cleanText(
      body.client_id
    );

  if (!clientId) {

    return {
      status: 400,
      data: {
        error:
          "client_id is required"
      }
    };
  }


  const client =
    await getClient(
      clientId
    );

  if (!client) {

    return {
      status: 404,
      data: {
        error:
          "Client not found"
      }
    };
  }


  /*
  IMPORTANT:
  We do not allow deleting First Bike accidentally.
  */

  if (
    client.slug ===
    "first-bike"
  ) {

    return {
      status: 403,
      data: {
        error:
          "First Bike cannot be deleted"
      }
    };
  }


  await supabaseRequest(
    `clients?id=eq.${encodeURIComponent(clientId)}`,
    {
      method:
        "DELETE",

      prefer:
        "return=minimal"
    }
  );


  return {
    status: 200,

    data: {
      success: true
    }
  };
}


/*
==================================================
Handler
==================================================
*/

module.exports =
async function handler(
  req,
  res
) {

  if (
    req.method !==
    "POST"
  ) {

    return res
      .status(405)
      .json({
        error:
          "Method not allowed"
      });
  }


  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY ||
    !ADMIN_PASSWORD
  ) {

    return res
      .status(500)
      .json({
        error:
          "Server configuration error"
      });
  }


  try {

    const body =
      req.body || {};


    /*
    ----------------------------------------------
    Auth
    ----------------------------------------------
    */

    if (
      !isAuthorized(body)
    ) {

      return res
        .status(401)
        .json({
          error:
            "Unauthorized"
        });
    }


    const action =
      cleanText(
        body.action
      );


    /*
    ----------------------------------------------
    Actions
    ----------------------------------------------
    */

    if (
      action ===
      "list"
    ) {

      const clients =
        await listClients();

      return res
        .status(200)
        .json({
          success: true,
          clients
        });
    }


    if (
      action ===
      "get"
    ) {

      const clientId =
        cleanText(
          body.client_id
        );

      const client =
        await getClient(
          clientId
        );

      if (!client) {

        return res
          .status(404)
          .json({
            error:
              "Client not found"
          });
      }

      return res
        .status(200)
        .json({
          success: true,
          client
        });
    }


    if (
      action ===
      "create"
    ) {

      const result =
        await createClient(
          body
        );

      return res
        .status(
          result.status
        )
        .json(
          result.data
        );
    }


    if (
      action ===
      "update"
    ) {

      const result =
        await updateClient(
          body
        );

      return res
        .status(
          result.status
        )
        .json(
          result.data
        );
    }


    if (
      action ===
      "toggle"
    ) {

      const result =
        await toggleClient(
          body
        );

      return res
        .status(
          result.status
        )
        .json(
          result.data
        );
    }


    if (
      action ===
      "delete"
    ) {

      const result =
        await deleteClient(
          body
        );

      return res
        .status(
          result.status
        )
        .json(
          result.data
        );
    }


    return res
      .status(400)
      .json({
        error:
          "Unknown action"
      });


  } catch (error) {

    console.error(
      "CLIENT ADMIN ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          "Unable to process client admin request"
      });
  }
};
