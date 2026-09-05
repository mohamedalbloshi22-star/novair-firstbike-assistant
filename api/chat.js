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


async function getApprovedKnowledge(clientId) {
  const rows = await supabaseRequest(
    `unanswered_questions` +
    `?client_id=eq.${clientId}` +
    `&resolved=eq.true` +
    `&approved_answer=not.is.null` +
    `&select=question,approved_answer,resolved_at` +
    `&order=resolved_at.desc` +
    `&limit=100`
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter(
    row =>
      row &&
      typeof row.question === "string" &&
      typeof row.approved_answer === "string" &&
      row.question.trim() &&
      row.approved_answer.trim()
  );
}


function buildApprovedKnowledgeText(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return "لا توجد إجابات إضافية معتمدة حاليًا.";
  }

  return rows
    .map((row, index) => {
      return `
${index + 1}.
السؤال أو الموضوع:
${row.question.trim()}

الإجابة المعتمدة:
${row.approved_answer.trim()}
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
            language: safeLanguage
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
        client_id: clientId,
        session_id: sessionId,
        status: "open",
        resolved_by_ai: null,
        human_handoff: false,
        callback_requested: false,
        language: safeLanguage
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

        resolved: false
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
      جلب المعرفة التي اعتمدها
      مدير NOVAIRE من لوحة الإدارة.
    */

    let approvedKnowledge = [];

    try {
      approvedKnowledge =
        await getApprovedKnowledge(
          client.id
        );
    } catch (knowledgeError) {
      console.error(
        "APPROVED KNOWLEDGE LOAD ERROR:",
        knowledgeError
      );

      approvedKnowledge = [];
    }


    const approvedKnowledgeText =
      buildApprovedKnowledgeText(
        approvedKnowledge
      );


    const systemPrompt = `
أنت المساعد الذكي الرسمي لمحل First Bike للدراجات النارية في العين.

معلومات First Bike المؤكدة:

- النشاط:
تأجير وتصليح الدراجات النارية وقطع الغيار.

- الموقع:
العين، السلامات، شارع الهيبة، بجانب كافيه 1 مليون.

- ساعات العمل:
يوميًا من الساعة 3 مساءً حتى 12 منتصف الليل.


أسعار التأجير بالساعة:

- 50cc:
80 درهم.

- 90cc:
150 درهم.

- 220cc:
200 درهم.

- 400cc:
250 درهم.

- 800cc فما فوق:
300 درهم.


التصليح وقطع الغيار:

الأسعار تختلف حسب نوع العطل والقطعة والتركيب،
ولا توجد أسعار ثابتة إلا إذا كانت هناك إجابة معتمدة
ضمن قاعدة المعرفة أدناه.


==================================================

قاعدة المعرفة المعتمدة من إدارة NOVAIRE / First Bike:

${approvedKnowledgeText}

==================================================


قواعد استخدام قاعدة المعرفة المعتمدة:

1. المعلومات الموجودة في قاعدة المعرفة المعتمدة
تعتبر معلومات رسمية ومؤكدة.

2. إذا كان سؤال العميل يطابق سؤالًا معتمدًا
أو يحمل نفس المعنى،
استخدم الإجابة المعتمدة.

3. لا يشترط أن يستخدم العميل نفس الكلمات
الموجودة في السؤال الأصلي.
افهم المعنى والسياق.

4. يمكنك صياغة الإجابة المعتمدة بصورة طبيعية
ومختصرة، لكن لا تغير معناها ولا تضف معلومات
غير موجودة فيها.

5. إذا تعارضت إجابة معتمدة حديثة مع معلومة
سابقة، أعط الأولوية للإجابة المعتمدة الأحدث.

6. لا تخبر العميل أن الإجابة جاءت من
"قاعدة المعرفة" أو من "لوحة الإدارة".

7. لا تعرض أي معلومات إدارية أو داخلية.


==================================================

قواعد الإجابة العامة:

1. أجب فقط بناءً على المعلومات المؤكدة
المتاحة لك عن First Bike.

2. لا تخترع سعرًا أو سياسة أو خدمة أو شرطًا
أو معلومة غير موجودة.

3. المعلومات الأساسية أعلاه وقاعدة المعرفة
المعتمدة كلاهما مصادر مؤكدة.

4. إذا كان السؤال يحتاج معلومة غير موجودة
في المعلومات الأساسية ولا في قاعدة المعرفة
المعتمدة، أخبر العميل باختصار أن المعلومة
تحتاج تأكيدًا من First Bike.

5. عندما لا تستطيع إعطاء إجابة مؤكدة
بسبب عدم توفر المعلومة، أضف في نهاية ردك
بالضبط:

${UNANSWERED_MARKER}

6. لا تضف العلامة السابقة إذا استطعت الإجابة
من المعلومات الأساسية أو قاعدة المعرفة المعتمدة.

7. لا تشرح للعميل معنى العلامة.

8. أجب بالعربية إذا كانت اللغة المطلوبة ar،
وبالإنجليزية إذا كانت en.

9. إذا كانت الإجابة المعتمدة مكتوبة بالعربية
وكانت المحادثة باللغة الإنجليزية،
ترجم معنى الإجابة بدقة إلى الإنجليزية
دون إضافة معلومات جديدة.

10. اجعل الإجابة قصيرة ومهنية ومفيدة.

11. إذا كان العميل يحتاج موظفًا أو اتصالًا،
أخبره أنه يستطيع استخدام زر التحدث مع مسؤول
أو طلب اتصال الموجود في المحادثة.


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

              max_tokens: 500,

              system:
                systemPrompt,

              messages:
                messages.map(
                  message => ({
                    role:
                      message.role,

                    content:
                      String(
                        message.content ||
                        ""
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

        approved_knowledge_items:
          approvedKnowledge.length
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
