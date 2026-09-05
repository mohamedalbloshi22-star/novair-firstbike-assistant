const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;

const CLIENT_SLUG = "first-bike";


async function supabaseRequest(path, options = {}) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: options.method || "GET",

      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer:
          options.prefer ||
          "return=representation"
      },

      body: options.body
        ? JSON.stringify(options.body)
        : undefined
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


function isAuthorized(req) {
  const suppliedPassword =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  return (
    ADMIN_PASSWORD &&
    suppliedPassword &&
    suppliedPassword === ADMIN_PASSWORD
  );
}


async function getClient() {
  const rows = await supabaseRequest(
    `clients?slug=eq.${encodeURIComponent(
      CLIENT_SLUG
    )}&select=id,name,slug&limit=1`
  );

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return null;
  }

  return rows[0];
}


module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }


  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY ||
    !ADMIN_PASSWORD
  ) {
    return res.status(500).json({
      error:
        "Server configuration is incomplete"
    });
  }


  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }


  try {

    const action =
      typeof req.body?.action === "string"
        ? req.body.action
        : "";


    const client =
      await getClient();


    if (!client) {
      return res.status(404).json({
        error: "Client not found"
      });
    }


    /*
      LIST
    */

    if (action === "list") {

      const rows =
        await supabaseRequest(
          `knowledge_base` +
          `?client_id=eq.${client.id}` +
          `&select=id,question,answer,language,source,active,created_at,updated_at` +
          `&order=updated_at.desc`
        );


      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
      );


      return res.status(200).json({
        client,

        items:
          Array.isArray(rows)
            ? rows
            : []
      });
    }


    /*
      CREATE
    */

    if (action === "create") {

      const question =
        typeof req.body?.question === "string"
          ? req.body.question.trim()
          : "";

      const answer =
        typeof req.body?.answer === "string"
          ? req.body.answer.trim()
          : "";

      const language =
        req.body?.language === "en"
          ? "en"
          : "ar";


      if (!question || !answer) {
        return res.status(400).json({
          error:
            "question and answer are required"
        });
      }


      /*
        نتحقق من عدم وجود نفس السؤال
        مسبقًا لنفس العميل.
      */

      const existing =
        await supabaseRequest(
          `knowledge_base` +
          `?client_id=eq.${client.id}` +
          `&question=eq.${encodeURIComponent(question)}` +
          `&select=id,question,answer,active` +
          `&limit=1`
        );


      if (
        Array.isArray(existing) &&
        existing.length > 0
      ) {
        return res.status(409).json({
          error:
            "Knowledge item already exists"
        });
      }


      const inserted =
        await supabaseRequest(
          "knowledge_base",
          {
            method: "POST",

            prefer:
              "return=representation",

            body: {
              client_id:
                client.id,

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


      if (
        !Array.isArray(inserted) ||
        inserted.length === 0
      ) {
        throw new Error(
          "Unable to create knowledge item"
        );
      }


      return res.status(201).json({
        success: true,
        item: inserted[0]
      });
    }


    /*
      UPDATE
    */

    if (action === "update") {

      const id =
        typeof req.body?.id === "string"
          ? req.body.id.trim()
          : "";

      const question =
        typeof req.body?.question === "string"
          ? req.body.question.trim()
          : "";

      const answer =
        typeof req.body?.answer === "string"
          ? req.body.answer.trim()
          : "";


      if (!id) {
        return res.status(400).json({
          error: "id is required"
        });
      }


      if (!question || !answer) {
        return res.status(400).json({
          error:
            "question and answer are required"
        });
      }


      const existing =
        await supabaseRequest(
          `knowledge_base` +
          `?id=eq.${encodeURIComponent(id)}` +
          `&client_id=eq.${client.id}` +
          `&select=id&limit=1`
        );


      if (
        !Array.isArray(existing) ||
        existing.length === 0
      ) {
        return res.status(404).json({
          error:
            "Knowledge item not found"
        });
      }


      const updated =
        await supabaseRequest(
          `knowledge_base` +
          `?id=eq.${encodeURIComponent(id)}` +
          `&client_id=eq.${client.id}`,
          {
            method: "PATCH",

            prefer:
              "return=representation",

            body: {
              question,
              answer,

              updated_at:
                new Date().toISOString()
            }
          }
        );


      return res.status(200).json({
        success: true,

        item:
          Array.isArray(updated) &&
          updated.length > 0
            ? updated[0]
            : null
      });
    }


    /*
      TOGGLE ACTIVE
    */

    if (action === "toggle") {

      const id =
        typeof req.body?.id === "string"
          ? req.body.id.trim()
          : "";

      const active =
        typeof req.body?.active === "boolean"
          ? req.body.active
          : null;


      if (!id) {
        return res.status(400).json({
          error: "id is required"
        });
      }


      if (active === null) {
        return res.status(400).json({
          error:
            "active must be boolean"
        });
      }


      const updated =
        await supabaseRequest(
          `knowledge_base` +
          `?id=eq.${encodeURIComponent(id)}` +
          `&client_id=eq.${client.id}`,
          {
            method: "PATCH",

            prefer:
              "return=representation",

            body: {
              active,

              updated_at:
                new Date().toISOString()
            }
          }
        );


      if (
        !Array.isArray(updated) ||
        updated.length === 0
      ) {
        return res.status(404).json({
          error:
            "Knowledge item not found"
        });
      }


      return res.status(200).json({
        success: true,
        item: updated[0]
      });
    }


    /*
      DELETE
    */

    if (action === "delete") {

      const id =
        typeof req.body?.id === "string"
          ? req.body.id.trim()
          : "";


      if (!id) {
        return res.status(400).json({
          error: "id is required"
        });
      }


      const deleted =
        await supabaseRequest(
          `knowledge_base` +
          `?id=eq.${encodeURIComponent(id)}` +
          `&client_id=eq.${client.id}`,
          {
            method: "DELETE",

            prefer:
              "return=representation"
          }
        );


      if (
        !Array.isArray(deleted) ||
        deleted.length === 0
      ) {
        return res.status(404).json({
          error:
            "Knowledge item not found"
        });
      }


      return res.status(200).json({
        success: true,
        deleted_id: id
      });
    }


    return res.status(400).json({
      error: "Invalid action"
    });


  } catch (error) {

    console.error(
      "KNOWLEDGE ADMIN API ERROR:",
      error
    );


    return res.status(500).json({
      error:
        "Unable to manage knowledge base",

      details:
        error.message
    });
  }
};
