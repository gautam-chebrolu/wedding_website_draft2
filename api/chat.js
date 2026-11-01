/**
 * POST /api/chat — website chatbot (streams plain-text tokens).
 *
 * Body: { messages: [{role:'user'|'assistant', content}], page?, now? }
 *
 * Requires the OPENAI_API_KEY environment variable:
 *   - Vercel:  Project → Settings → Environment Variables
 *   - Local:   .env.local (gitignored), then `node scripts/dev-server.js`
 */

const { streamAnswer, sanitizeHistory } = require('./_lib/assistant');
const { readJson, sendJson, clientIp, sameOrigin, rateLimiter } = require('./_lib/http');

const allowPerMinute = rateLimiter({ limit: 15, windowMs: 60 * 1000 });
const allowPerHour = rateLimiter({ limit: 120, windowMs: 60 * 60 * 1000 });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Forbidden' });

  const ip = clientIp(req);
  if (!allowPerMinute(ip) || !allowPerHour(ip)) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { error: 'Too many questions — please wait a minute.' });
  }

  const body = await readJson(req);
  const history = sanitizeHistory(body && body.messages);
  if (!history.length || history[history.length - 1].role !== 'user') {
    return sendJson(res, 400, { error: 'Ask a question to get started.' });
  }

  // `now` is only sent by ?now= preview links; it just changes this answer's
  // sense of "current time", nothing else.
  let now = Date.now();
  if (body && body.now) {
    const t = Date.parse(body.now);
    if (!isNaN(t) && Math.abs(t - now) < 400 * 86400000) now = t;
  }

  let started = false;
  try {
    await streamAnswer({ history, now }, (token) => {
      if (!started) {
        started = true;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
      }
      res.write(token);
    });
    if (!started) return sendJson(res, 502, { error: 'Empty answer' });
    res.end();
  } catch (err) {
    console.error('chat error:', err.message);
    if (!started) return sendJson(res, err.status || 502, { error: 'The assistant is unavailable right now.' });
    res.end('\n\n(Sorry — I got cut off. Please try again.)');
  }
};
