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


async function saveToKnowledgeBase(
  clientId,
  question,
  answer
) {

  const existingRows =
    await supabaseRequest(
      `knowledge_base` +
      `?client_id=eq.${clientId}` +
      `&question=eq.${encodeURIComponent(question)}` +
      `&select=id,question,answer,active` +
      `&limit=1`
    );


  /*
    إذا كانت المعرفة موجودة مسبقًا:
    نحدّث الإجابة بدل إنشاء نسخة أخرى.
  */

  if (
    Array.isArray(existingRows) &&
    existingRows.length > 0
  ) {

    const knowledgeId =
      existingRows[0].id;

    const updated =
      await supabaseRequest(
        `knowledge_base?id=eq.${encodeURIComponent(
          knowledgeId
        )}`,
        {
          method: "PATCH",

          prefer:
            "return=representation",

          body: {
            answer,
            active: true,
            updated_at:
              new Date().toISOString()
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
    إذا لم تكن موجودة:
    ننشئ معلومة جديدة.
  */

  const inserted =
    await supabaseRequest(
      "knowledge_base",
      {
        method: "POST",

        prefer:
          "return=representation",

        body: {
          client_id:
            clientId,

          question,

          answer,

          language:
            "ar",

          source:
            "admin",

          active:
            true
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


module.exports = async function handler(
  req,
  res
) {

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
      عرض الأسئلة غير المحلولة
    */

    if (action === "list") {

      const questions =
        await supabaseRequest(
          `unanswered_questions` +
          `?client_id=eq.${client.id}` +
          `&resolved=eq.false` +
          `&select=id,question,approved_answer,resolved,resolved_at,created_at` +
          `&order=created_at.desc`
        );


      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
      );


      return res.status(200).json({
        client,

        questions:
          Array.isArray(questions)
            ? questions
            : []
      });
    }


    /*
      اعتماد الإجابة وحل السؤال
    */

    if (action === "resolve") {

      const questionId =
        typeof req.body?.question_id === "string"
          ? req.body.question_id.trim()
          : "";


      const approvedAnswer =
        typeof req.body?.approved_answer === "string"
          ? req.body.approved_answer.trim()
          : "";


      if (!questionId) {
        return res.status(400).json({
          error:
            "question_id is required"
        });
      }


      if (!approvedAnswer) {
        return res.status(400).json({
          error:
            "approved_answer is required"
        });
      }


      /*
        نتأكد أن السؤال تابع لهذا العميل
      */

      const existingRows =
        await supabaseRequest(
          `unanswered_questions` +
          `?id=eq.${encodeURIComponent(
            questionId
          )}` +
          `&client_id=eq.${client.id}` +
          `&select=id,question,resolved` +
          `&limit=1`
        );


      if (
        !Array.isArray(existingRows) ||
        existingRows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Question not found"
        });
      }


      const unansweredQuestion =
        existingRows[0];


      /*
        أولًا:
        نحفظ الإجابة في قاعدة المعرفة الرسمية.
      */

      const knowledgeResult =
        await saveToKnowledgeBase(
          client.id,
          unansweredQuestion.question,
          approvedAnswer
        );


      /*
        ثانيًا:
        نحدّث سجل السؤال غير المجاب.
      */

      const updatedRows =
        await supabaseRequest(
          `unanswered_questions` +
          `?id=eq.${encodeURIComponent(
            questionId
          )}` +
          `&client_id=eq.${client.id}`,
          {
            method: "PATCH",

            prefer:
              "return=representation",

            body: {
              approved_answer:
                approvedAnswer,

              resolved:
                true,

              resolved_at:
                new Date().toISOString()
            }
          }
        );


      return res.status(200).json({

        success: true,

        message:
          "Approved answer saved to knowledge base",

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
