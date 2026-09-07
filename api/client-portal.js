const { getClientSession } = require("./_client-session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const session = getClientSession(req);

  if (!session) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

  return res.status(200).json({
    success: true,
    client_id: session.client_id,
    client_slug: session.client_slug
  });
};
