const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";
const UNANSWERED_MARKER = "[[UNANSWERED]]";

const MAX_KNOWLEDGE_ITEMS_SENT = 10;
const MAX_MESSAGES_SENT = 8;
const MAX_ANTHROPIC_TOKENS = 300;


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

        ...(options.prefer
          ? { Prefer: options.prefer }
          : {})
      },

      body: options.body
        ? JSON.stringify(options.body)
        : undefined
    }
  );


  const text = await response.text();


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
Client
==================================================
*/

async function getClient() {

  const rows = await supabaseRequest(
    `clients` +
    `?slug=eq.${encodeURIComponent(CLIENT_SLUG)}` +
    `&select=id,name,slug` +
    `&limit=1`
  );


  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    throw new Error(
      "Client not found"
    );
  }


  return rows[0];
}


/*
==================================================
Knowledge Base
==================================================
*/

async function getKnowledgeBase(clientId) {

  const rows = await supabaseRequest(
    `knowledge_base` +
    `?client_id=eq.${clientId}` +
    `&active=eq.true` +
    `&select=id,question,answer,language,source,updated_at` +
    `&order=updated_at.desc` +
    `&limit=200`
  );


  if (!Array.isArray(rows)) {
    return [];
  }


  return rows.filter(
    row =>
      row &&
      typeof row.question === "string" &&
      typeof row.answer === "string" &&
      row.question.trim() &&
      row.answer.trim()
  );
}


/*
==================================================
Text normalization
==================================================
*/

function normalizeText(value) {

  return String(value || "")
    .toLowerCase()

    /*
      Arabic diacritics
    */
    .replace(
      /[\u064B-\u065F\u0670\u06D6-\u06ED]/g,
      ""
    )

    /*
      Normalize Arabic letters
    */
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")

    /*
      Remove punctuation
    */
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )

    .replace(/\s+/g, " ")
    .trim();
}


const STOP_WORDS = new Set([
  "هل",
  "في",
  "من",
  "على",
  "الى",
  "إلى",
  "عن",
  "ما",
  "ماذا",
  "كم",
  "كيف",
  "متى",
  "وين",
  "اين",
  "أين",
  "عندكم",
  "عندك",
  "لديكم",
  "يوجد",
  "فيه",
  "فيها",
  "هو",
  "هي",
  "هذا",
  "هذه",
  "و",
  "او",
  "أو",
  "the",
  "a",
  "an",
  "is",
  "are",
  "do",
  "does",
  "what",
  "when",
  "where",
  "how",
  "can",
  "you",
  "your",
  "have",
  "has",
  "there"
]);


function tokenize(value) {

  return normalizeText(value)
    .split(" ")
    .filter(
      token =>
        token.length >= 2 &&
        !STOP_WORDS.has(token)
    );
}


/*
==================================================
Choose relevant knowledge
==================================================
*/

function scoreKnowledgeItem(
  item,
  userQuestion
) {

  const normalizedQuestion =
    normalizeText(userQuestion);

  const normalizedStoredQuestion =
    normalizeText(item.question);

  const normalizedAnswer =
    normalizeText(item.answer);


  if (!normalizedQuestion) {
    return 0;
  }


  /*
    Strong exact / containment match
  */

  if (
    normalizedStoredQuestion ===
    normalizedQuestion
  ) {

    return 1000;
  }


  let score = 0;


  if (
    normalizedStoredQuestion.includes(
      normalizedQuestion
    ) ||
    normalizedQuestion.includes(
      normalizedStoredQuestion
    )
  ) {

    score += 300;
  }


  const userTokens =
    tokenize(userQuestion);

  const storedTokens =
    new Set(
      tokenize(item.question)
    );

  const answerTokens =
    new Set(
      tokenize(item.answer)
    );


  for (const token of userTokens) {

    if (storedTokens.has(token)) {
      score += 30;
    }

    if (answerTokens.has(token)) {
      score += 8;
    }
  }


  /*
    Prefer newer item slightly when scores tie
  */

  if (item.updated_at) {

    const age =
      Date.now() -
      new Date(item.updated_at).getTime();

    const thirtyDays =
      30 * 24 * 60 * 60 * 1000;


    if (
      Number.isFinite(age) &&
      age >= 0 &&
      age <= thirtyDays
    ) {

      score += 2;
    }
  }


  return score;
}


function selectRelevantKnowledge(
  rows,
  userQuestion
) {

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    return [];
  }


  /*
    When the knowledge base is still small,
    sending it all is safe and preserves recall.
  */

  if (
    rows.length <=
    MAX_KNOWLEDGE_ITEMS_SENT
  ) {

    return rows;
  }


  const scored =
    rows
      .map(
        item => ({
          item,
          score:
            scoreKnowledgeItem(
              item,
              userQuestion
            )
        })
      )

      .sort(
        (a, b) =>
          b.score - a.score
      );


  const relevant =
    scored
      .filter(
        entry =>
          entry.score > 0
      )

      .slice(
        0,
        MAX_KNOWLEDGE_ITEMS_SENT
      )

      .map(
        entry =>
          entry.item
      );


  /*
    If lexical matching found nothing,
    send only the newest few items instead
    of the entire database.
  */

  if (relevant.length === 0) {

    return rows.slice(
      0,
      Math.min(
        5,
        MAX_KNOWLEDGE_ITEMS_SENT
      )
    );
  }


  return relevant;
}


function buildKnowledgeText(rows) {

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    return "لا توجد معلومات إضافية معتمدة ذات صلة حاليًا.";
  }


  return rows
    .map(
      (row, index) => {

        return (
          `${index + 1}. ` +
          `السؤال/الموضوع: ${row.question.trim()}\n` +
          `الإجابة المعتمدة: ${row.answer.trim()}`
        );
      }
    )

    .join("\n\n");
}


/*
==================================================
Conversation
==================================================
*/

async function getOrCreateConversation(
  clientId,
  sessionId,
  language
) {

  const safeLanguage =
    language === "en"
      ? "en"
      : "ar";


  const existing =
    await supabaseRequest(
      `conversations` +
      `?client_id=eq.${clientId}` +
      `&session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=id,client_id,session_id,resolved_by_ai,human_handoff,callback_requested,language` +
      `&limit=1`
    );


  if (
    Array.isArray(existing) &&
    existing.length > 0
  ) {

    const conversation =
      existing[0];


    if (
      conversation.language !==
      safeLanguage
    ) {

      await supabaseRequest(
        `conversations?id=eq.${conversation.id}`,
        {
          method: "PATCH",
          prefer: "return=minimal",

          body: {
            language:
              safeLanguage
          }
        }
      );


      conversation.language =
        safeLanguage;
    }


    return conversation;
  }


  const created =
    await supabaseRequest(
      "conversations",
      {
        method: "POST",
        prefer: "return=representation",

        body: {
          client_id:
            clientId,

          session_id:
            sessionId,

          status:
            "open",

          resolved_by_ai:
            null,

          human_handoff:
            false,

          callback_requested:
            false,

          language:
            safeLanguage
        }
      }
    );


  if (
    !Array.isArray(created) ||
    created.length === 0
  ) {

    throw new Error(
      "Unable to create conversation"
    );
  }


  return created[0];
}


/*
==================================================
Messages
==================================================
*/

async function saveMessage(
  conversationId,
  sender,
  content,
  inputTokens = null,
  outputTokens = null
) {

  await supabaseRequest(
    "messages",
    {
      method: "POST",
      prefer: "return=minimal",

      body: {
        conversation_id:
          conversationId,

        sender,

        content,

        input_tokens:
          inputTokens,

        output_tokens:
          outputTokens
      }
    }
  );
}


/*
==================================================
Unanswered
==================================================
*/

async function saveUnansweredQuestion(
  clientId,
  conversationId,
  question
) {

  await supabaseRequest(
    "unanswered_questions",
    {
      method: "POST",
      prefer: "return=minimal",

      body: {
        client_id:
          clientId,

        conversation_id:
          conversationId,

        question,

        resolved:
          false
      }
    }
  );
}


/*
==================================================
Resolution status
==================================================
*/

async function updateResolutionStatus(
  conversation,
  isUnanswered
) {

  let resolvedByAi = true;


  if (
    isUnanswered ||
    conversation.resolved_by_ai === false ||
    conversation.human_handoff === true ||
    conversation.callback_requested === true
  ) {

    resolvedByAi = false;
  }


  await supabaseRequest(
    `conversations?id=eq.${conversation.id}`,
    {
      method: "PATCH",
      prefer: "return=minimal",

      body: {
        resolved_by_ai:
          resolvedByAi
      }
    }
  );


  return resolvedByAi;
}


/*
==================================================
Latest user message
==================================================
*/

function getLatestUserMessage(messages) {

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {

    if (
      messages[i] &&
      messages[i].role === "user"
    ) {

      return String(
        messages[i].content || ""
      ).trim();
    }
  }


  return "";
}


/*
==================================================
Trim conversation history
==================================================
*/

function prepareMessagesForClaude(messages) {

  if (!Array.isArray(messages)) {
    return [];
  }


  return messages

    .filter(
      message =>
        message &&
        (
          message.role === "user" ||
          message.role === "assistant"
        ) &&
        String(
          message.content || ""
        ).trim()
    )

    .slice(
      -MAX_MESSAGES_SENT
    )

    .map(
      message => ({
        role:
          message.role,

        content:
          String(
            message.content || ""
          ).trim()
      })
    );
}


/*
==================================================
Clean hidden marker
==================================================
*/

function cleanAssistantText(text) {

  return String(text || "")
    .replaceAll(
      UNANSWERED_MARKER,
      ""
    )
    .trim();
}


/*
==================================================
Handler
==================================================
*/

module.exports = async function handler(
  req,
  res
) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error:
        "Method not allowed"
    });
  }


  if (
    !ANTHROPIC_API_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {

    return res.status(500).json({
      error:
        "Required environment variables are missing"
    });
  }


  try {

    const {
      messages,
      language = "ar",
      session_id
    } = req.body || {};


    const safeLanguage =
      language === "en"
        ? "en"
        : "ar";


    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {

      return res.status(400).json({
        error:
          "Messages are required"
      });
    }


    if (
      !session_id ||
      typeof session_id !== "string"
    ) {

      return res.status(400).json({
        error:
          "Session ID is required"
      });
    }


    const latestUserMessage =
      getLatestUserMessage(
        messages
      );


    if (!latestUserMessage) {

      return res.status(400).json({
        error:
          "User message is required"
      });
    }


    /*
    ==============================================
    1. Get client
    ==============================================
    */

    const client =
      await getClient();


    /*
    ==============================================
    2. Conversation + knowledge in parallel
    ==============================================
    */

    const [
      conversation,
      knowledgeResult
    ] = await Promise.all([
      getOrCreateConversation(
        client.id,
        session_id,
        safeLanguage
      ),

      getKnowledgeBase(
        client.id
      ).catch(
        error => {

          console.error(
            "KNOWLEDGE BASE LOAD ERROR:",
            error
          );

          return [];
        }
      )
    ]);


    /*
    ==============================================
    3. Save user's message
    ==============================================
    */

    await saveMessage(
      conversation.id,
      "user",
      latestUserMessage
    );


    /*
    ==============================================
    4. Select only relevant knowledge
    ==============================================
    */

    const relevantKnowledge =
      selectRelevantKnowledge(
        knowledgeResult,
        latestUserMessage
      );


    const knowledgeText =
      buildKnowledgeText(
        relevantKnowledge
      );


    /*
    ==============================================
    5. Shorter system prompt
    ==============================================
    */

    const systemPrompt = `
أنت المساعد الرسمي لـ First Bike للدراجات النارية في العين.

معلومات أساسية معتمدة:
- النشاط: تأجير وتصليح الدراجات النارية وقطع الغيار.
- الموقع: العين، السلامات، شارع الهيبة، بجانب كافيه 1 مليون.
- الدوام: يوميًا من 3 مساءً إلى 12 منتصف الليل.

أسعار التأجير بالساعة:
- 50cc: 80 درهم.
- 90cc: 150 درهم.
- 220cc: 200 درهم.
- 400cc: 250 درهم.
- 800cc فما فوق: 300 درهم.

المعلومات المعتمدة الإضافية ذات الصلة:
${knowledgeText}

قواعد إلزامية:
- أجب فقط من المعلومات الأساسية أو المعلومات المعتمدة أعلاه.
- افهم معنى سؤال العميل؛ لا يشترط التطابق الحرفي.
- يمكنك إعادة صياغة المعلومة دون تغيير معناها.
- لا تخترع أسعارًا أو شروطًا أو سياسات أو خدمات أو مواعيد.
- إذا لم توجد إجابة مؤكدة، أخبر العميل أن المعلومة تحتاج تأكيدًا من First Bike، ثم أضف في نهاية الرد ${UNANSWERED_MARKER}
- لا تضف العلامة إذا كانت لديك إجابة مؤكدة.
- لا تذكر قاعدة المعرفة أو العلامة أو أي معلومات إدارية للعميل.
- إذا احتاج العميل موظفًا أو اتصالًا، يمكن إرشاده إلى زر التحدث مع مسؤول أو طلب اتصال.
- اجعل الرد قصيرًا وطبيعيًا ومهنيًا.
- لغة الرد الحالية: ${safeLanguage === "en" ? "English" : "العربية"}.
`;


    /*
    ==============================================
    6. Send only recent useful messages
    ==============================================
    */

    const claudeMessages =
      prepareMessagesForClaude(
        messages
      );


    /*
    ==============================================
    7. Anthropic
    ==============================================
    */

    const anthropicResponse =
      await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-api-key":
              ANTHROPIC_API_KEY,

            "anthropic-version":
              "2023-06-01"
          },

          body:
            JSON.stringify({
              model:
                "claude-sonnet-4-6",

              max_tokens:
                MAX_ANTHROPIC_TOKENS,

              system:
                systemPrompt,

              messages:
                claudeMessages
            })
        }
      );


    const anthropicText =
      await anthropicResponse.text();


    if (!anthropicResponse.ok) {

      throw new Error(
        `Anthropic error ${anthropicResponse.status}: ${anthropicText}`
      );
    }


    const anthropicData =
      JSON.parse(
        anthropicText
      );


    const rawAnswer =
      anthropicData?.content?.[0]?.text
        ? anthropicData.content[0].text
        : "";


    if (!rawAnswer) {

      throw new Error(
        "Anthropic returned no answer"
      );
    }


    /*
    ==============================================
    8. Detect unanswered
    ==============================================
    */

    const isUnanswered =
      rawAnswer.includes(
        UNANSWERED_MARKER
      );


    const cleanAnswer =
      cleanAssistantText(
        rawAnswer
      );


    /*
    ==============================================
    9. Save result operations in parallel
    ==============================================
    */

    const saveAssistantPromise =
      saveMessage(
        conversation.id,
        "assistant",
        cleanAnswer,

        anthropicData.usage?.input_tokens ??
          null,

        anthropicData.usage?.output_tokens ??
          null
      );


    const resolutionPromise =
      updateResolutionStatus(
        conversation,
        isUnanswered
      );


    const unansweredPromise =
      isUnanswered
        ? saveUnansweredQuestion(
            client.id,
            conversation.id,
            latestUserMessage
          ).catch(
            error => {

              console.error(
                "UNANSWERED QUESTION LOG ERROR:",
                error
              );

              return null;
            }
          )
        : Promise.resolve(null);


    const [
      ,
      resolvedByAi
    ] = await Promise.all([
      saveAssistantPromise,
      resolutionPromise,
      unansweredPromise
    ]);


    /*
    ==============================================
    10. Return clean response
    ==============================================
    */

    if (
      anthropicData.content &&
      anthropicData.content[0]
    ) {

      anthropicData.content[0].text =
        cleanAnswer;
    }


    return res.status(200).json({

      ...anthropicData,

      novaire: {

        client_id:
          client.id,

        conversation_id:
          conversation.id,

        session_id,

        language:
          safeLanguage,

        unanswered:
          isUnanswered,

        resolved_by_ai:
          resolvedByAi,

        knowledge_items:
          knowledgeResult.length,

        knowledge_items_used:
          relevantKnowledge.length
      }
    });


  } catch (error) {

    console.error(
      "CHAT API ERROR:",
      error
    );


    return res.status(500).json({
      error:
        "Unable to process chat request"
    });
  }
};
