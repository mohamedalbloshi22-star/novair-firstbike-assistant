const knowledgeAdminHandler = require('./knowledge-admin');
const { isAdminSession } = require('./_admin-session');

const MAX_QUESTION_CHARS = 1000;
const MAX_ANSWER_CHARS = 6000;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdminSession(req)) return res.status(401).json({ error: 'Unauthorized' });

  const action = text(req.body?.action);
  if (action === 'create' || action === 'update') {
    const question = text(req.body?.question);
    const answer = text(req.body?.answer);

    if (question.length > MAX_QUESTION_CHARS) {
      return res.status(400).json({ error: `Question must not exceed ${MAX_QUESTION_CHARS} characters` });
    }
    if (answer.length > MAX_ANSWER_CHARS) {
      return res.status(400).json({ error: `Answer must not exceed ${MAX_ANSWER_CHARS} characters` });
    }
  }

  return knowledgeAdminHandler(req, res);
};
