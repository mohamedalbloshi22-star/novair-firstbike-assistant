const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.NOVAIRE_ADMIN_PASSWORD;

const CLIENT_SLUG = "first-bike";

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation"
    },
    body: options.body
      ? JSON.stringify(options.body)
      : undefined
  });

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
      typeof req.body?.action === "string"
        ? req.body.action
        : "";

    const clientRows = await supabaseRequest(
      `clients?slug=eq.${encodeURIComponent(
        CLIENT_SLUG
      )}&select=id,name,slug&limit=1`
    );

    if (
      !Array.isArray(clientRows) ||
      clientRows.length === 0
    ) {
      return res.status(404).json({
        error: "Client not found"
      });
    }

    const client = clientRows[0];

    if (action === "list") {
      const questions =
        await supabaseRequest(
          `unanswered_questions?client_id=eq.${client.id}&resolved=eq.false&select=id,question,approved_answer,resolved,resolved_at,created_at&order=created_at.desc`
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
          error: "question_id is required"
        });
      }

      if (!approvedAnswer) {
        return res.status(400).json({
          error: "approved_answer is required"
        });
      }

      const existingRows =
        await supabaseRequest(
          `unanswered_questions?id=eq.${encodeURIComponent(
            questionId
          )}&client_id=eq.${client.id}&select=id,resolved&limit=1`
        );

      if (
        !Array.isArray(existingRows) ||
        existingRows.length === 0
      ) {
        return res.status(404).json({
          error: "Question not found"
        });
      }

      const updatedRows =
        await supabaseRequest(
          `unanswered_questions?id=eq.${encodeURIComponent(
            questionId
          )}&client_id=eq.${client.id}`,
          {
            method: "PATCH",
            prefer: "return=representation",
            body: {
              approved_answer:
                approvedAnswer,
              resolved: true,
              resolved_at:
                new Date().toISOString()
            }
          }
        );

      return res.status(200).json({
        success: true,
        question:
          Array.isArray(updatedRows) &&
          updatedRows.length > 0
            ? updatedRows[0]
            : null
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
        "Unable to manage unanswered questions"
    });
  }
};
