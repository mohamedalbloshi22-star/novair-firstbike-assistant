const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLIENT_SLUG = "first-bike";
const UNANSWERED_MARKER = "[[UNANSWERED]]";


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
    throw new Error("Client not found");
  }

  return rows[0];
}


/*
  قاعدة المعرفة الرسمية
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


function buildKnowledgeText(rows) {

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return "لا توجد معلومات إضافية معتمدة حاليًا.";
  }

  return rows
    .map((row, index) => {
      return `
${index + 1}.

السؤال أو الموضوع:
${row.question.trim()}

الإجابة الرسمية المعتمدة:
${row.answer.trim()}
`;
    })
    .join("\n");
}


async function getOrCreateConversation(
  clientId,
  sessionId,
  language
) {

  const safeLanguage =
    language === "en"
      ? "en"
      : "ar";


  const existing = await supabaseRequest(
    `conversations?client_id=eq.${clientId}` +
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
      conversation.language !== safeLanguage
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


  const created = await supabaseRequest(
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


function cleanAssistantText(text) {

  return String(text || "")
    .replaceAll(
      UNANSWERED_MARKER,
      ""
    )
    .trim();
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
      getLatestUserMessage(messages);


    if (!latestUserMessage) {

      return res.status(400).json({
        error:
          "User message is required"
      });
    }


    const client =
      await getClient();


    const conversation =
      await getOrCreateConversation(
        client.id,
        session_id,
        safeLanguage
      );


    await saveMessage(
      conversation.id,
      "user",
      latestUserMessage
    );


    /*
      تحميل قاعدة المعرفة الرسمية
    */

    let knowledgeBase = [];


    try {

      knowledgeBase =
        await getKnowledgeBase(
          client.id
        );

    } catch (knowledgeError) {

      console.error(
        "KNOWLEDGE BASE LOAD ERROR:",
        knowledgeError
      );

      knowledgeBase = [];
    }


    const knowledgeText =
      buildKnowledgeText(
        knowledgeBase
      );


    const systemPrompt = `
أنت المساعد الذكي الرسمي لمحل First Bike للدراجات النارية في العين.

==================================================

معلومات First Bike الأساسية:

النشاط:
تأجير وتصليح الدراجات النارية وقطع الغيار.

الموقع:
العين، السلامات، شارع الهيبة، بجانب كافيه 1 مليون.

ساعات العمل:
يوميًا من الساعة 3 مساءً حتى 12 منتصف الليل.

==================================================

أسعار التأجير بالساعة:

50cc:
80 درهم.

90cc:
150 درهم.

220cc:
200 درهم.

400cc:
250 درهم.

800cc فما فوق:
300 درهم.

==================================================

قاعدة المعرفة الرسمية والمعتمدة:

${knowledgeText}

==================================================

قواعد قاعدة المعرفة:

1. قاعدة المعرفة أعلاه معتمدة رسميًا.

2. إذا كان سؤال العميل يطابق معلومة موجودة في قاعدة المعرفة
أو يحمل نفس المعنى، استخدم الإجابة الموجودة فيها.

3. لا يشترط أن يستخدم العميل نفس صياغة السؤال المخزنة.

4. افهم معنى السؤال قبل الإجابة.

5. يمكنك إعادة صياغة الإجابة بصورة طبيعية ومهنية،
لكن لا تغير معناها ولا تضف معلومات غير معتمدة.

6. إذا وجد أكثر من سجل مناسب،
استخدم المعلومة الأحدث والأكثر ارتباطًا بالسؤال.

7. لا تخبر العميل بوجود قاعدة معرفة أو لوحة إدارة.

8. لا تعرض أي معلومات إدارية داخلية.

==================================================

قواعد الإجابة العامة:

1. أجب فقط اعتمادًا على:
- معلومات First Bike الأساسية.
- قاعدة المعرفة الرسمية أعلاه.

2. لا تخترع:
- أسعارًا.
- سياسات.
- شروطًا.
- خدمات.
- مواعيد.
- معلومات غير موجودة.

3. إذا لم تكن الإجابة موجودة في المعلومات الأساسية
ولا في قاعدة المعرفة، أخبر العميل أن المعلومة تحتاج
إلى تأكيد من First Bike.

4. في هذه الحالة فقط أضف في نهاية ردك:

${UNANSWERED_MARKER}

5. لا تضف العلامة إذا استطعت إعطاء إجابة مؤكدة.

6. لا تشرح للعميل معنى العلامة.

7. إذا كانت اللغة الحالية عربية، أجب بالعربية.

8. إذا كانت اللغة الحالية إنجليزية، أجب بالإنجليزية.

9. إذا كانت المعلومة المخزنة بالعربية والعميل يتحدث الإنجليزية،
ترجم المعنى بدقة دون إضافة معلومات جديدة.

10. اجعل الرد مختصرًا ومهنيًا ومفيدًا.

11. إذا احتاج العميل لموظف أو اتصال،
يمكنك إرشاده إلى زر التحدث مع مسؤول أو طلب اتصال.

==================================================

لغة المحادثة الحالية:

${safeLanguage === "en"
  ? "English"
  : "Arabic"}
`;


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
                500,

              system:
                systemPrompt,

              messages:
                messages.map(
                  message => ({
                    role:
                      message.role,

                    content:
                      String(
                        message.content || ""
                      )
                  })
                )
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
      anthropicData &&
      anthropicData.content &&
      anthropicData.content[0] &&
      anthropicData.content[0].text
        ? anthropicData.content[0].text
        : "";


    if (!rawAnswer) {

      throw new Error(
        "Anthropic returned no answer"
      );
    }


    const isUnanswered =
      rawAnswer.includes(
        UNANSWERED_MARKER
      );


    const cleanAnswer =
      cleanAssistantText(
        rawAnswer
      );


    await saveMessage(
      conversation.id,
      "assistant",
      cleanAnswer,

      anthropicData.usage?.input_tokens ??
        null,

      anthropicData.usage?.output_tokens ??
        null
    );


    if (isUnanswered) {

      try {

        await saveUnansweredQuestion(
          client.id,
          conversation.id,
          latestUserMessage
        );

      } catch (unansweredError) {

        console.error(
          "UNANSWERED QUESTION LOG ERROR:",
          unansweredError
        );
      }
    }


    const resolvedByAi =
      await updateResolutionStatus(
        conversation,
        isUnanswered
      );


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
          knowledgeBase.length
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
