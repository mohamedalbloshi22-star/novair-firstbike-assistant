const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  isAdminSession
} = require("./_admin-session");

const {
  getClientSession
} = require("./_client-session");


async function supabaseRequest(path) {

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",

      headers: {
        apikey: SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,

        "Content-Type":
          "application/json"
      }
    }
  );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Supabase error ${response.status}: ${text}`
    );
  }

  if (!text) {
    return [];
  }

  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}


function safeSlug(value) {

  const slug =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9_-]{2,80}$/.test(slug)
  ) {
    return null;
  }

  return slug;
}


function percentage(
  part,
  total
) {

  if (!total) {
    return 0;
  }

  return Number(
    (
      (part / total) *
      100
    ).toFixed(1)
  );
}


function uaeDate(value) {

  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "Asia/Dubai",

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit"
    }
  ).format(date);
}


function uaeHour(value) {

  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Dubai",

        hour:
          "2-digit",

        hour12:
          false
      }
    ).format(date)
  );
}


async function loadClientBySlug(clientSlug) {

  const clients =
    await supabaseRequest(
      `clients` +
      `?slug=eq.${encodeURIComponent(clientSlug)}` +
      `&select=id,name,slug,config` +
      `&limit=1`
    );

  if (
    !Array.isArray(clients) ||
    clients.length === 0
  ) {
    return null;
  }

  return clients[0];
}


async function loadClientById(clientId) {

  const clients =
    await supabaseRequest(
      `clients` +
      `?id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,name,slug,config` +
      `&limit=1`
    );

  if (
    !Array.isArray(clients) ||
    clients.length === 0
  ) {
    return null;
  }

  return clients[0];
}


async function loadDashboardData(client) {

  const conversations =
    await supabaseRequest(
      `conversations` +
      `?client_id=eq.${encodeURIComponent(client.id)}` +
      `&select=id,started_at,created_at,language,resolved_by_ai,human_handoff,callback_requested`
    );


  const conversationIds =
    conversations
      .map(
        row => row.id
      )
      .filter(Boolean);


  let messages = [];


  if (
    conversationIds.length > 0
  ) {

    const ids =
      conversationIds.join(",");


    messages =
      await supabaseRequest(
        `messages` +
        `?conversation_id=in.(${ids})` +
        `&select=id,conversation_id,sender,content,created_at`
      );
  }


  const contactRequests =
    await supabaseRequest(
      `contact_requests` +
      `?client_id=eq.${encodeURIComponent(client.id)}` +
      `&select=id,request_type,customer_name,phone,reason,status,created_at` +
      `&order=created_at.desc`
    );


  const unansweredAll =
    await supabaseRequest(
      `unanswered_questions` +
      `?client_id=eq.${encodeURIComponent(client.id)}` +
      `&select=id,question,created_at,resolved` +
      `&order=created_at.desc`
    );


  const unansweredQuestions =
    unansweredAll.filter(
      row =>
        row.resolved !== true
    );


  const totalConversations =
    conversations.length;


  const totalMessages =
    messages.length;


  const aiResolved =
    conversations.filter(
      row =>
        row.resolved_by_ai === true
    ).length;


  const handoffCount =
    conversations.filter(
      row =>
        row.human_handoff === true
    ).length;


  const callbackCount =
    conversations.filter(
      row =>
        row.callback_requested === true
    ).length;


  const arabicCount =
    conversations.filter(
      row =>
        row.language === "ar"
    ).length;


  const englishCount =
    conversations.filter(
      row =>
        row.language === "en"
    ).length;


  const questionMap =
    {};


  messages
    .filter(
      row =>
        row.sender === "user" &&
        row.content
    )
    .forEach(
      row => {

        const question =
          String(
            row.content
          )
          .trim()
          .replace(
            /\s+/g,
            " "
          );


        if (!question) {
          return;
        }


        const key =
          question.toLowerCase();


        if (
          !questionMap[key]
        ) {

          questionMap[key] =
            {
              question,
              count: 0
            };
        }


        questionMap[key]
          .count += 1;
      }
    );


  const commonQuestions =
    Object.values(
      questionMap
    )
    .sort(
      (a,b) =>
        b.count -
        a.count
    )
    .slice(
      0,
      10
    );


  const hourMap =
    {};


  conversations.forEach(
    row => {

      const hour =
        uaeHour(
          row.started_at ||
          row.created_at
        );


      if (
        hour === null ||
        Number.isNaN(hour)
      ) {
        return;
      }


      hourMap[hour] =
        (
          hourMap[hour] ||
          0
        ) + 1;
    }
  );


  const peakHours =
    Object.entries(
      hourMap
    )
    .map(
      ([hour,count]) => ({
        hour:
          Number(hour),

        count
      })
    )
    .sort(
      (a,b) =>
        b.count -
        a.count
    )
    .slice(
      0,
      10
    );


  const dailyMap =
    {};


  conversations.forEach(
    row => {

      const day =
        uaeDate(
          row.started_at ||
          row.created_at
        );


      if (!day) {
        return;
      }


      if (
        !dailyMap[day]
      ) {

        dailyMap[day] =
          {
            date:
              day,

            conversations:
              0,

            messages:
              0
          };
      }


      dailyMap[day]
        .conversations += 1;
    }
  );


  messages.forEach(
    row => {

      const day =
        uaeDate(
          row.created_at
        );


      if (!day) {
        return;
      }


      if (
        !dailyMap[day]
      ) {

        dailyMap[day] =
          {
            date:
              day,

            conversations:
              0,

            messages:
              0
          };
      }


      dailyMap[day]
        .messages += 1;
    }
  );


  const dailyStats =
    Object.values(
      dailyMap
    )
    .sort(
      (a,b) =>
        b.date.localeCompare(
          a.date
        )
    )
    .slice(
      0,
      30
    );


  return {

    client: {

      id:
        client.id,

      slug:
        client.slug,

      name:
        client.config?.brand_name ||
        client.name ||
        client.slug
    },


    summary: {

      total_conversations:
        totalConversations,

      total_messages:
        totalMessages,

      ai_resolution_rate:
        percentage(
          aiResolved,
          totalConversations
        ),

      unanswered_questions:
        unansweredQuestions.length,

      human_handoff:
        handoffCount,

      callback_requested:
        callbackCount,

      total_contact_requests:
        contactRequests.length,

      callback_rate_percent:
        percentage(
          callbackCount,
          totalConversations
        ),

      human_handoff_rate_percent:
        percentage(
          handoffCount,
          totalConversations
        )
    },


    languages: {

      ar:
        arabicCount,

      en:
        englishCount
    },


    common_questions:
      commonQuestions,


    peak_hours:
      peakHours,


    daily_stats:
      dailyStats,


    recent_contacts:
      contactRequests.slice(
        0,
        20
      ),


    recent_unanswered:
      unansweredAll.slice(
        0,
        20
      )
  };
}


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
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {

    return res
      .status(500)
      .json({
        error:
          "Server configuration missing"
      });
  }


  try {

    /*
    ================================================
    CLIENT PORTAL
    GET /api/dashboard
    ================================================
    */

    if (
      req.method === "GET"
    ) {

      const session =
        getClientSession(req);


      if (!session) {

        return res
          .status(401)
          .json({
            success:
              false,

            error:
              "Unauthorized"
          });
      }


      const client =
        await loadClientById(
          session.client_id
        );


      if (!client) {

        return res
          .status(404)
          .json({
            success:
              false,

            error:
              "Client not found"
          });
      }


      if (
        client.config &&
        client.config.active === false
      ) {

        return res
          .status(403)
          .json({
            success:
              false,

            error:
              "Client inactive"
          });
      }


      const data =
        await loadDashboardData(
          client
        );


      /*
      Client-safe response only.
      No API costs.
      No tokens.
      No NOVAIRE internal information.
      */


      return res
        .status(200)
        .json({

          success:
            true,

          client: {

            name:
              data.client.name,

            slug:
              data.client.slug
          },

          stats: {

            total_conversations:
              data.summary
                .total_conversations,

            contact_requests:
              data.summary
                .total_contact_requests,

            ai_resolution_rate:
              data.summary
                .ai_resolution_rate,

            unanswered_questions:
              data.summary
                .unanswered_questions,

            human_handoffs:
              data.summary
                .human_handoff,

            callback_requests:
              data.summary
                .callback_requested
          },

          languages: {

            arabic:
              data.languages.ar,

            english:
              data.languages.en,

            arabic_percent:
              percentage(
                data.languages.ar,
                data.languages.ar +
                data.languages.en
              ),

            english_percent:
              percentage(
                data.languages.en,
                data.languages.ar +
                data.languages.en
              )
          },

          peak_hours:
            data.peak_hours.map(
              item => ({
                hour:
                  item.hour,

                conversations:
                  item.count
              })
            ),

          daily_stats:
            data.daily_stats,

          common_questions:
            data.common_questions,

          recent_contacts:
            data.recent_contacts,

          recent_unanswered:
            data.recent_unanswered
        });
    }


    /*
    ================================================
    NOVAIRE ADMIN
    POST /api/dashboard
    ================================================
    */

    if (
      req.method === "POST"
    ) {

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


      const clientSlug =
        safeSlug(
          req.body?.client_slug ||
          req.body?.client
        );


      if (!clientSlug) {

        return res
          .status(400)
          .json({
            error:
              "Valid client is required"
          });
      }


      const client =
        await loadClientBySlug(
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


      if (
        client.config &&
        client.config.active === false
      ) {

        return res
          .status(403)
          .json({
            error:
              "Client inactive"
          });
      }


      const data =
        await loadDashboardData(
          client
        );


      return res
        .status(200)
        .json({

          client:
            data.client,

          summary:
            data.summary,

          languages:
            data.languages,

          common_questions:
            data.common_questions,

          peak_hours:
            data.peak_hours,

          daily_stats:
            data.daily_stats
        });
    }


    return res
      .status(405)
      .json({
        error:
          "Method not allowed"
      });


  } catch (error) {

    console.error(
      "DASHBOARD API ERROR:",
      error
    );


    return res
      .status(500)
      .json({

        error:
          "Unable to load dashboard data",

        details:
          error.message
      });
  }
};
