/**
 * POST /api/chat — website chatbot (streams plain-text tokens).
 *
 * Body: { messages: [{role:'user'|'assistant', content}], page? }
 * Requires MESSAGING_ASSISTANT_URL + WEB_CHAT_SERVICE_TOKEN on Vercel or
 * in .env.local. The shared backend owns knowledge and the production clock.
 */

const { proxyAnswer, sanitizeHistory } = require('./_lib/messaging-proxy');
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

  let started = false;
  try {
    await proxyAnswer({ history, ip, onToken: (token) => {
      if (!started) {
        started = true;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
      }
      res.write(token);
    } });
    if (!started) return sendJson(res, 502, { error: 'Empty answer' });
    res.end();
  } catch (err) {
    console.error('chat error:', err.message);
    if (!started) return sendJson(res, err.status || 502, { error: 'The assistant is unavailable right now.' });
    res.end('\n\n(Sorry — I got cut off. Please try again.)');
  }
};
