const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  isAdminSession
} = require("./_admin-session");

const { safeErrorLog } = require('../lib/nsr-safe-log');


/*
==================================================
Supabase
==================================================
*/

async function supabaseRequest(
  path,
  options = {}
) {

  const response = await fetch(
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

        Prefer:
          options.prefer ||
          "return=representation"
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
      `Supabase ${response.status}: ${text}`
    );
  }

  return text
    ? JSON.parse(text)
    : [];
}


/*
==================================================
Helpers
==================================================
*/

function cleanText(value) {

  return typeof value === "string"
    ? value.trim()
    : "";
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
Client
==================================================
*/

async function getClient(
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
Save approved answer to client's knowledge base
==================================================
*/

async function saveToKnowledgeBase(
  clientId,
  question,
  answer,
  language
) {

  const existingRows =
    await supabaseRequest(
      `knowledge_base` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&question=eq.${encodeURIComponent(question)}` +
      `&select=id,question,answer,active` +
      `&limit=1`
    );


  if (
    Array.isArray(existingRows) &&
    existingRows.length > 0
  ) {

    const knowledgeId =
      existingRows[0].id;

    const updated =
      await supabaseRequest(
        `knowledge_base` +
        `?id=eq.${encodeURIComponent(knowledgeId)}` +
        `&client_id=eq.${encodeURIComponent(clientId)}`,
        {
          method:
            "PATCH",

          prefer:
            "return=representation",

          body: {
            answer,
            language,
            active:
              true,

            updated_at:
              new Date()
                .toISOString()
          }
        }
      );

    return {
      action:
        "updated",

      record:
        Array.isArray(updated) &&
        updated.length > 0
          ? updated[0]
          : null
    };
  }


  const inserted =
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
    action:
      "created",

    record:
      Array.isArray(inserted) &&
      inserted.length > 0
        ? inserted[0]
        : null
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
          "Server configuration is incomplete"
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


    const action =
      cleanText(
        body.action
      );


    /*
    ==================================================
    Client
    ==================================================
    */

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
      await getClient(
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


    /*
    ==================================================
    List
    ==================================================
    */

    if (
      action === "list"
    ) {

      const questions =
        await supabaseRequest(
          `unanswered_questions` +
          `?client_id=eq.${encodeURIComponent(client.id)}` +
          `&resolved=eq.false` +
          `&select=id,question,approved_answer,resolved,resolved_at,created_at` +
          `&order=created_at.desc`
        );


      return res
        .status(200)
        .json({

          success:
            true,

          client: {
            id:
              client.id,

            name:
              client.name,

            slug:
              client.slug
          },

          questions:
            Array.isArray(
              questions
            )
              ? questions
              : []
        });
    }


    /*
    ==================================================
    Resolve
    ==================================================
    */

    if (
      action === "resolve"
    ) {

      const questionId =
        cleanText(
          body.question_id
        );


      const approvedAnswer =
        cleanText(
          body.approved_answer
        );


      const language =
        normalizeLanguage(
          body.language
        );


      if (!questionId) {

        return res
          .status(400)
          .json({
            error:
              "question_id is required"
          });
      }


      if (!approvedAnswer) {

        return res
          .status(400)
          .json({
            error:
              "approved_answer is required"
          });
      }


      const existingRows =
        await supabaseRequest(
          `unanswered_questions` +
          `?id=eq.${encodeURIComponent(questionId)}` +
          `&client_id=eq.${encodeURIComponent(client.id)}` +
          `&select=id,question,resolved` +
          `&limit=1`
        );


      if (
        !Array.isArray(
          existingRows
        ) ||
        existingRows.length === 0
      ) {

        return res
          .status(404)
          .json({
            error:
              "Question not found for this client"
          });
      }


      const unansweredQuestion =
        existingRows[0];


      if (
        unansweredQuestion.resolved ===
        true
      ) {

        return res
          .status(409)
          .json({
            error:
              "Question is already resolved"
          });
      }


      const knowledgeResult =
        await saveToKnowledgeBase(
          client.id,
          unansweredQuestion.question,
          approvedAnswer,
          language
        );


      const updatedRows =
        await supabaseRequest(
          `unanswered_questions` +
          `?id=eq.${encodeURIComponent(questionId)}` +
          `&client_id=eq.${encodeURIComponent(client.id)}`,
          {
            method:
              "PATCH",

            prefer:
              "return=representation",

            body: {
              approved_answer:
                approvedAnswer,

              resolved:
                true,

              resolved_at:
                new Date()
                  .toISOString()
            }
          }
        );


      return res
        .status(200)
        .json({

          success:
            true,

          message:
            "Approved answer saved to selected client's knowledge base",

          client: {
            id:
              client.id,

            name:
              client.name,

            slug:
              client.slug
          },

          question:
            Array.isArray(
              updatedRows
            ) &&
            updatedRows.length > 0
              ? updatedRows[0]
              : null,

          knowledge_base:
            knowledgeResult
        });
    }


    return res
      .status(400)
      .json({
        error:
          "Invalid action"
      });


  } catch (error) {

    safeErrorLog(
      "UNANSWERED_ADMIN_API_ERROR",
      error
    );


    return res
      .status(500)
      .json({

        error:
          "Unable to manage unanswered questions"
      });
  }
};
