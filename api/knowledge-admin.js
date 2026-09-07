const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  isAdminSession
} = require("./_admin-session");


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

  const slug =
    cleanText(value)
      .toLowerCase();

  if (
    !/^[a-z0-9_-]{2,80}$/.test(slug)
  ) {
    return "";
  }

  return slug;
}


function normalizeLanguage(value) {

  return value === "en"
    ? "en"
    : "ar";
}


/*
==================================================
Get Client
==================================================
*/

async function getClientBySlug(
  clientSlug
) {

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
    return null;
  }

  return rows[0];
}


/*
==================================================
List Knowledge
==================================================
*/

async function listKnowledge(
  clientId
) {

  const rows =
    await supabaseRequest(
      `knowledge_base` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,client_id,question,answer,language,source,active,created_at,updated_at` +
      `&order=updated_at.desc.nullslast,created_at.desc`
    );

  return Array.isArray(rows)
    ? rows
    : [];
}


/*
==================================================
Create
==================================================
*/

async function createKnowledge(
  clientId,
  body
) {

  const question =
    cleanText(
      body.question
    );

  const answer =
    cleanText(
      body.answer
    );

  const language =
    normalizeLanguage(
      body.language
    );

  if (
    !question ||
    !answer
  ) {

    return {
      status: 400,

      data: {
        error:
          "Question and answer are required"
      }
    };
  }


  const duplicates =
    await supabaseRequest(
      `knowledge_base` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&question=eq.${encodeURIComponent(question)}` +
      `&select=id` +
      `&limit=1`
    );


  if (
    Array.isArray(duplicates) &&
    duplicates.length > 0
  ) {

    return {
      status: 409,

      data: {
        error:
          "Knowledge item already exists"
      }
    };
  }


  const created =
    await supabaseRequest(
      "knowledge_base",
      {
        method:
          "POST",

        prefer:
          "return=representation",

        body: {
          client_id:
            clientId,

          question,

          answer,

          language,

          source:
            "admin",

          active:
            true
        }
      }
    );


  return {
    status: 201,

    data: {
      success: true,

      item:
        Array.isArray(created)
          ? created[0]
          : null
    }
  };
}


/*
==================================================
Update
==================================================
*/

async function updateKnowledge(
  clientId,
  body
) {

  const id =
    cleanText(
      body.id
    );

  const question =
    cleanText(
      body.question
    );

  const answer =
    cleanText(
      body.answer
    );

  const language =
    normalizeLanguage(
      body.language
    );

  if (
    !id ||
    !question ||
    !answer
  ) {

    return {
      status: 400,

      data: {
        error:
          "id, question and answer are required"
      }
    };
  }


  const existing =
    await supabaseRequest(
      `knowledge_base` +
      `?id=eq.${encodeURIComponent(id)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id` +
      `&limit=1`
    );


  if (
    !Array.isArray(existing) ||
    existing.length === 0
  ) {

    return {
      status: 404,

      data: {
        error:
          "Knowledge item not found"
      }
    };
  }


  const updated =
    await supabaseRequest(
      `knowledge_base` +
      `?id=eq.${encodeURIComponent(id)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}`,
      {
        method:
          "PATCH",

        prefer:
          "return=representation",

        body: {
          question,
          answer,
          language
        }
      }
    );


  return {
    status: 200,

    data: {
      success: true,

      item:
        Array.isArray(updated)
          ? updated[0]
          : null
    }
  };
}


/*
==================================================
Toggle
==================================================
*/

async function toggleKnowledge(
  clientId,
  body
) {

  const id =
    cleanText(
      body.id
    );

  if (!id) {

    return {
      status: 400,

      data: {
        error:
          "id is required"
      }
    };
  }


  const rows =
    await supabaseRequest(
      `knowledge_base` +
      `?id=eq.${encodeURIComponent(id)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,active` +
      `&limit=1`
    );


  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    return {
      status: 404,

      data: {
        error:
          "Knowledge item not found"
      }
    };
  }


  const nextActive =
    rows[0].active === false;


  await supabaseRequest(
    `knowledge_base` +
      `?id=eq.${encodeURIComponent(id)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}`,
    {
      method:
        "PATCH",

      prefer:
        "return=minimal",

      body: {
        active:
          nextActive
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
Delete
==================================================
*/

async function deleteKnowledge(
  clientId,
  body
) {

  const id =
    cleanText(
      body.id
    );

  if (!id) {

    return {
      status: 400,

      data: {
        error:
          "id is required"
      }
    };
  }


  const rows =
    await supabaseRequest(
      `knowledge_base` +
      `?id=eq.${encodeURIComponent(id)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id` +
      `&limit=1`
    );


  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    return {
      status: 404,

      data: {
        error:
          "Knowledge item not found"
      }
    };
  }


  await supabaseRequest(
    `knowledge_base` +
      `?id=eq.${encodeURIComponent(id)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}`,
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

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  if (
    req.method !== "POST"
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
    !SUPABASE_KEY
  ) {

    return res
      .status(500)
      .json({
        error:
          "Server configuration error"
      });
  }


  if (
    !isAdminSession(req)
  ) {

    return res
      .status(401)
      .json({
        error:
          "Unauthorized"
      });
  }


  try {

    const body =
      req.body || {};


    const clientSlug =
      normalizeSlug(
        body.client_slug
      );


    if (!clientSlug) {

      return res
        .status(400)
        .json({
          error:
            "Valid client_slug is required"
        });
    }


    const client =
      await getClientBySlug(
        clientSlug
      );


    if (!client) {

      return res
        .status(404)
        .json({
          error:
            "Client not found"
        });
    }


    const action =
      cleanText(
        body.action
      );


    if (
      action === "list"
    ) {

      const items =
        await listKnowledge(
          client.id
        );


      return res
        .status(200)
        .json({
          success: true,

          client: {
            id:
              client.id,

            name:
              client.name,

            slug:
              client.slug
          },

          items
        });
    }


    if (
      action === "create"
    ) {

      const result =
        await createKnowledge(
          client.id,
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
      action === "update"
    ) {

      const result =
        await updateKnowledge(
          client.id,
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
      action === "toggle"
    ) {

      const result =
        await toggleKnowledge(
          client.id,
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
      action === "delete"
    ) {

      const result =
        await deleteKnowledge(
          client.id,
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
      "KNOWLEDGE ADMIN ERROR:",
      error
    );


    return res
      .status(500)
      .json({
        error:
          "Unable to process knowledge request"
      });
  }
};
