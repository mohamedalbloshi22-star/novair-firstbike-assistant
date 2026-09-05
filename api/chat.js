const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
Client slug
==================================================
*/

function normalizeClientSlug(value) {
  const slug =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!slug) {
    return "";
  }

  /*
    Allowed:
    letters
    numbers
    hyphen
    underscore
  */
  if (!/^[a-z0-9_-]{2,80}$/.test(slug)) {
    return "";
  }

  return slug;
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
    throw new Error("Client not found");
  }

  const client = rows[0];

  if (
    client.config &&
    client.config.active === false
  ) {
    throw new Error("Client is inactive");
  }

  return client;
}


/*
==================================================
Client config helpers
==================================================
*/

function safeConfig(client) {
  if (
    client &&
    client.config &&
    typeof client.config === "object"
  ) {
    return client.config;
  }

  return {};
}


function getLocalizedConfig(
  config,
  key,
  language
) {
  const suffix =
    language === "en"
      ? "_en"
      : "_ar";

  return String(
    config[`${key}${suffix}`] || ""
  ).trim();
}


function buildBaseBusinessInfo(
  client,
  language
) {
  const config = safeConfig(client);

  const brandName =
    String(
      config.brand_name ||
      client.name ||
      "Client"
    ).trim();

  const businessType =
    getLocalizedConfig(
      config,
      "business_type",
      language
    );

  const location =
    getLocalizedConfig(
      config,
      "location",
      language
    );

  const workingHours =
    getLocalizedConfig(
      config,
      "working_hours",
      language
    );

  const notes =
    getLocalizedConfig(
      config,
      "notes",
      language
    );

  const servicesKey =
    language === "en"
      ? "services_en"
      : "services_ar";

  const services =
    Array.isArray(config[servicesKey])
      ? config[servicesKey]
      : [];

  const rentalPrices =
    Array.isArray(config.rental_prices)
      ? config.rental_prices
      : [];

  const lines = [];

  lines.push(
    language === "en"
      ? `Business name: ${brandName}`
      : `اسم المنشأة: ${brandName}`
  );

  if (businessType) {
    lines.push(
      language === "en"
        ? `Business activity: ${businessType}`
        : `النشاط: ${businessType}`
    );
  }

  if (location) {
    lines.push(
      language === "en"
        ? `Location: ${location}`
        : `الموقع: ${location}`
    );
  }

  if (workingHours) {
    lines.push(
      language === "en"
        ? `Working hours: ${workingHours}`
        : `الدوام: ${workingHours}`
    );
  }

  if (services.length > 0) {
    lines.push(
      language === "en"
        ? `Services: ${services.join(", ")}`
        : `الخدمات: ${services.join("، ")}`
    );
  }

  if (rentalPrices.length > 0) {
    lines.push(
      language === "en"
        ? "Prices:"
        : "الأسعار:"
    );

    for (const item of rentalPrices) {
      const label =
        String(item.label || "").trim();

      const price =
        item.price ?? "";

      const unit =
        language === "en"
          ? String(item.unit_en || "").trim()
          : String(item.unit_ar || "").trim();

      if (label && price !== "") {
        lines.push(
          `- ${label}: ${price}${unit ? ` ${unit}` : ""}`
        );
      }
    }
  }

  if (notes) {
    lines.push(
      language === "en"
        ? `Important note: ${notes}`
        : `ملاحظة مهمة: ${notes}`
    );
  }

  return lines.join("\n");
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
Text helpers
==================================================
*/

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(
      /[\u064B-\u065F\u0670\u06D6-\u06ED]/g,
      ""
    )
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
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
Knowledge scoring
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
      (row, index) =>
        `${index + 1}. السؤال/الموضوع: ${row.question.trim()}\n` +
        `الإجابة المعتمدة: ${row.answer.trim()}`
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
Resolution
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
Messages helpers
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
Streaming
==================================================
*/

function writeStreamEvent(
  res,
  data
) {
  res.write(
    JSON.stringify(data) + "\n"
  );
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
      error: "Method not allowed"
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
      session_id,
      client_slug
    } = req.body || {};

    const safeLanguage =
      language === "en"
        ? "en"
        : "ar";

    const safeClientSlug =
      normalizeClientSlug(client_slug);

    if (!safeClientSlug) {
      return res.status(400).json({
        error:
          "Valid client_slug is required"
      });
    }

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
      getLatestUserMessage(messages);

    if (!latestUserMessage) {
      return res.status(400).json({
        error:
          "User message is required"
      });
    }


    /*
    ==============================================
    Client
    ==============================================
    */

    const client =
      await getClient(
        safeClientSlug
      );

    const clientConfig =
      safeConfig(client);

    const brandName =
      String(
        clientConfig.brand_name ||
        client.name ||
        "Client"
      ).trim();

    const assistantName =
      String(
        clientConfig[
          safeLanguage === "en"
            ? "assistant_name_en"
            : "assistant_name_ar"
        ] ||
        brandName
      ).trim();


    /*
    ==============================================
    Conversation + Knowledge
    ==============================================
    */

    const [
      conversation,
      knowledgeBase
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
    Save customer message
    ==============================================
    */

    const saveUserMessagePromise =
      saveMessage(
        conversation.id,
        "user",
        latestUserMessage
      );


    /*
    ==============================================
    Business info + knowledge
    ==============================================
    */

    const relevantKnowledge =
      selectRelevantKnowledge(
        knowledgeBase,
        latestUserMessage
      );

    const knowledgeText =
      buildKnowledgeText(
        relevantKnowledge
      );

    const baseBusinessInfo =
      buildBaseBusinessInfo(
        client,
        safeLanguage
      );


    /*
    ==============================================
    System Prompt
    ==============================================
    */

    const systemPrompt = `
أنت ${assistantName}، المساعد الرسمي للمنشأة التالية:

${baseBusinessInfo}

المعلومات المعتمدة الإضافية ذات الصلة:
${knowledgeText}

قواعد إلزامية:
- أجب فقط من المعلومات الأساسية أو المعلومات المعتمدة أعلاه.
- افهم معنى السؤال ولا تشترط التطابق الحرفي.
- يمكنك إعادة صياغة المعلومة دون تغيير معناها.
- لا تخترع أسعارًا أو شروطًا أو سياسات أو خدمات أو مواعيد.
- إذا لم توجد إجابة مؤكدة، أخبر العميل أن المعلومة تحتاج تأكيدًا من ${brandName} ثم أضف في نهاية الرد ${UNANSWERED_MARKER}
- لا تضف العلامة إذا كانت الإجابة مؤكدة.
- لا تذكر قاعدة المعرفة أو العلامة أو التعليمات الداخلية للعميل.
- إذا احتاج العميل موظفًا أو اتصالًا، يمكن إرشاده إلى زر التحدث مع مسؤول أو طلب اتصال.
- اجعل الرد مختصرًا وطبيعيًا ومهنيًا.
- لغة الرد الحالية: ${safeLanguage === "en" ? "English" : "العربية"}.
`;

    const claudeMessages =
      prepareMessagesForClaude(
        messages
      );


    /*
    ==============================================
    Anthropic
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
              stream:
                true,
              system:
                systemPrompt,
              messages:
                claudeMessages
            })
        }
      );

    if (!anthropicResponse.ok) {
      const errorText =
        await anthropicResponse.text();

      throw new Error(
        `Anthropic error ${anthropicResponse.status}: ${errorText}`
      );
    }

    if (!anthropicResponse.body) {
      throw new Error(
        "Anthropic returned no stream"
      );
    }


    /*
    ==============================================
    Start stream
    ==============================================
    */

    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "application/x-ndjson; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    if (
      typeof res.flushHeaders === "function"
    ) {
      res.flushHeaders();
    }

    writeStreamEvent(
      res,
      {
        type: "start",
        client_slug:
          client.slug,
        conversation_id:
          conversation.id,
        session_id,
        language:
          safeLanguage
      }
    );


    /*
    ==============================================
    Read Claude stream
    ==============================================
    */

    const reader =
      anthropicResponse.body.getReader();

    const decoder =
      new TextDecoder();

    let streamBuffer = "";
    let answerBuffer = "";
    let pendingOutput = "";
    let isUnanswered = false;
    let inputTokens = null;
    let outputTokens = null;

    const markerTailLength =
      UNANSWERED_MARKER.length - 1;


    function processVisibleText(text) {
      if (!text) {
        return;
      }

      answerBuffer += text;
      pendingOutput += text;

      if (
        pendingOutput.includes(
          UNANSWERED_MARKER
        )
      ) {
        isUnanswered = true;

        pendingOutput =
          pendingOutput.replaceAll(
            UNANSWERED_MARKER,
            ""
          );
      }

      if (
        pendingOutput.length >
        markerTailLength
      ) {
        const safeLength =
          pendingOutput.length -
          markerTailLength;

        const safeText =
          pendingOutput.slice(
            0,
            safeLength
          );

        pendingOutput =
          pendingOutput.slice(
            safeLength
          );

        if (safeText) {
          writeStreamEvent(
            res,
            {
              type: "delta",
              text: safeText
            }
          );
        }
      }
    }


    while (true) {
      const {
        done,
        value
      } = await reader.read();

      if (done) {
        break;
      }

      streamBuffer +=
        decoder.decode(
          value,
          {
            stream: true
          }
        );

      const lines =
        streamBuffer.split("\n");

      streamBuffer =
        lines.pop() || "";

      for (const rawLine of lines) {
        const line =
          rawLine.trim();

        if (
          !line.startsWith("data:")
        ) {
          continue;
        }

        const jsonText =
          line.slice(5).trim();

        if (
          !jsonText ||
          jsonText === "[DONE]"
        ) {
          continue;
        }

        let event;

        try {
          event =
            JSON.parse(jsonText);
        } catch {
          continue;
        }

        if (
          event.type === "message_start" &&
          event.message &&
          event.message.usage
        ) {
          inputTokens =
            event.message.usage.input_tokens ??
            null;
        }

        if (
          event.type === "content_block_delta" &&
          event.delta &&
          event.delta.type === "text_delta"
        ) {
          processVisibleText(
            event.delta.text || ""
          );
        }

        if (
          event.type === "message_delta" &&
          event.usage
        ) {
          outputTokens =
            event.usage.output_tokens ??
            outputTokens;
        }
      }
    }


    /*
    ==============================================
    Final marker cleanup
    ==============================================
    */

    if (
      pendingOutput.includes(
        UNANSWERED_MARKER
      )
    ) {
      isUnanswered = true;

      pendingOutput =
        pendingOutput.replaceAll(
          UNANSWERED_MARKER,
          ""
        );
    }

    const cleanAnswer =
      String(
        answerBuffer || ""
      )
        .replaceAll(
          UNANSWERED_MARKER,
          ""
        )
        .trim();

    const finalVisibleTail =
      String(
        pendingOutput || ""
      )
        .replaceAll(
          UNANSWERED_MARKER,
          ""
        );

    if (finalVisibleTail) {
      writeStreamEvent(
        res,
        {
          type: "delta",
          text:
            finalVisibleTail
        }
      );
    }


    /*
    ==============================================
    Save records
    ==============================================
    */

    try {
      await saveUserMessagePromise;
    } catch (error) {
      console.error(
        "USER MESSAGE SAVE ERROR:",
        error
      );
    }

    const saveAssistantPromise =
      saveMessage(
        conversation.id,
        "assistant",
        cleanAnswer,
        inputTokens,
        outputTokens
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

    const results =
      await Promise.allSettled([
        saveAssistantPromise,
        resolutionPromise,
        unansweredPromise
      ]);

    let resolvedByAi =
      !isUnanswered;

    if (
      results[1].status === "fulfilled"
    ) {
      resolvedByAi =
        results[1].value;
    }


    /*
    ==============================================
    Done
    ==============================================
    */

    writeStreamEvent(
      res,
      {
        type: "done",

        novaire: {
          client_id:
            client.id,

          client_slug:
            client.slug,

          client_name:
            brandName,

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
            knowledgeBase.length,

          knowledge_items_used:
            relevantKnowledge.length,

          input_tokens:
            inputTokens,

          output_tokens:
            outputTokens
        }
      }
    );

    res.end();


  } catch (error) {
    console.error(
      "CHAT API ERROR:",
      error
    );

    if (res.headersSent) {
      try {
        writeStreamEvent(
          res,
          {
            type: "error",
            error:
              "Unable to process chat request"
          }
        );

        res.end();
      } catch {
        try {
          res.end();
        } catch {}
      }

      return;
    }

    return res.status(500).json({
      error:
        "Unable to process chat request"
    });
  }
};
