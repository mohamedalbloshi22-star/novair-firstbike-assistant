const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  isAdminSession
} = require("./_admin-session");


async function supabaseRequest(path) {

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method:"GET",

      headers:{
        apikey:
          SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,

        "Content-Type":
          "application/json"
      }
    }
  );


  const text =
    await response.text();


  if(!response.ok){

    throw new Error(
      `Supabase error ${response.status}: ${text}`
    );
  }


  return text
    ? JSON.parse(text
