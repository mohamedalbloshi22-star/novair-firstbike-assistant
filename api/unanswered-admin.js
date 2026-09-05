const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;


/*
==================================================
Supabase
==================================================
*/

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
          options.prefer || "return=representation"
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
    cleanText(value).toLowerCase();

  if (!/^[a-z0-9_-]{2,80}$/.test(slug)) {
    return "";
  }

  return slug;
}


function normalizeLanguage(value) {
  return value === "en"
    ? "en"
    : "ar";
}


function isAuthorized(req) {

  const suppliedPassword =
    cleanText(req.body?.password);

  return Boolean(
    ADMIN_PASSWORD &&
    suppliedPassword &&
    suppliedPassword === ADMIN_PASSWORD
  );
}


/*
==================================================
Client
==================================================
*/

async function getClient(clientSlug) {

  const rows = await supabaseRequest(
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


  /*
    إذا كانت المعلومة موجودة عند نفس العميل،
    يتم تحديثها بدل إنشاء نسخة أخرى.
  */

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
          method: "PATCH",

          prefer: "return=representation",

          body: {
            answer,
            language,
            active: true,
            updated_at: new Date().toISOString()
          }
        }
      );

    return {
      action: "updated",

      record:
        Array.isArray(updated) &&
        updated.length > 0
          ? updated[0]
          : null
    };
  }


  /*
    إذا لم تكن موجودة،
    ننشئها لهذا العميل فقط.
  */

  const inserted =
    await supabaseRequest(
      "knowledge_base",
      {
        method: "POST",

        prefer: "return=representation",

        body: {
          client_id: clientId,
          question,
          answer,
          language,
          source: "admin",
          active: true
        }
      }
    );


  return {
    action: "created",

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
      error: "Server configuration is incomplete"
    });
  }


  if (!isAuthorized(req)) {

    return res.status(401).json({
      error: "Unauthorized"
    });
  }


  try {

    const action =
      cleanText(req.body?.action);


    /*
    ==================================================
    تحديد العميل من الطلب
    ==================================================
    */

    const clientSlug =
      normalizeSlug(
        req.body?.client_slug
      );


    if (!clientSlug) {

      return res.status(400).json({
        error: "Valid client_slug is required"
      });
    }


    const client =
      await getClient(clientSlug);


    if (!client) {

      return res.status(404).json({
        error: "Client not found"
      });
    }


    /*
    ==================================================
    عرض الأسئلة غير المجابة للعميل المحدد فقط
    ==================================================
    */

    if (action === "list") {

      const questions =
        await supabaseRequest(
          `unanswered_questions` +
          `?client_id=eq.${encodeURIComponent(client.id)}` +
          `&resolved=eq.false` +
          `&select=id,question,approved_answer,resolved,resolved_at,created_at` +
          `&order=created_at.desc`
        );


      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
      );


      return res.status(200).json({

        success: true,

        client: {
          id: client.id,
          name: client.name,
          slug: client.slug
        },

        questions:
          Array.isArray(questions)
            ? questions
            : []
      });
    }


    /*
    ==================================================
    اعتماد الإجابة
    ==================================================
    */

    if (action === "resolve") {

      const questionId =
        cleanText(
          req.body?.question_id
        );


      const approvedAnswer =
        cleanText(
          req.body?.approved_answer
        );


      const language =
        normalizeLanguage(
          req.body?.language
        );


      if (!questionId) {

        return res.status(400).json({
          error: "question_id is required"
        });
      }


      if (!approvedAnswer) {

        return res.status(400).json({
          error: "approved_answer is required"
        });
      }


      /*
        مهم:
        لا نقبل السؤال إلا إذا كان تابعًا
        للعميل المحدد.
      */

      const existingRows =
        await supabaseRequest(
          `unanswered_questions` +
          `?id=eq.${encodeURIComponent(questionId)}` +
          `&client_id=eq.${encodeURIComponent(client.id)}` +
          `&select=id,question,resolved` +
          `&limit=1`
        );


      if (
        !Array.isArray(existingRows) ||
        existingRows.length === 0
      ) {

        return res.status(404).json({
          error: "Question not found for this client"
        });
      }


      const unansweredQuestion =
        existingRows[0];


      /*
        إذا كان السؤال محلولًا مسبقًا
      */

      if (unansweredQuestion.resolved === true) {

        return res.status(409).json({
          error: "Question is already resolved"
        });
      }


      /*
      ==================================================
      1. حفظ الإجابة في قاعدة معرفة العميل
      ==================================================
      */

      const knowledgeResult =
        await saveToKnowledgeBase(
          client.id,
          unansweredQuestion.question,
          approvedAnswer,
          language
        );


      /*
      ==================================================
      2. إغلاق السؤال غير المجاب
      ==================================================
      */

      const updatedRows =
        await supabaseRequest(
          `unanswered_questions` +
          `?id=eq.${encodeURIComponent(questionId)}` +
          `&client_id=eq.${encodeURIComponent(client.id)}`,
          {
            method: "PATCH",

            prefer: "return=representation",

            body: {
              approved_answer: approvedAnswer,
              resolved: true,
              resolved_at: new Date().toISOString()
            }
          }
        );


      return res.status(200).json({

        success: true,

        message:
          "Approved answer saved to selected client's knowledge base",

        client: {
          id: client.id,
          name: client.name,
          slug: client.slug
        },

        question:
          Array.isArray(updatedRows) &&
          updatedRows.length > 0
            ? updatedRows[0]
            : null,

        knowledge_base:
          knowledgeResult
      });
    }


    return res.status(400).json({
      error: "Invalid action"
    });


  } catch (error) {

    console.error(
      "UNANSWERED ADMIN API ERROR:",
      error
    );


    return res.status(500).json({

      error:
        "Unable to manage unanswered questions",

      details:
        error.message
    });
  }
};
