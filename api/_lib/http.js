/**
 * api/_lib/http.js — small helpers shared by the serverless functions.
 * Works on Vercel's Node runtime and with the local dev-server.js.
 */

/** Read a JSON body whether or not the platform already parsed it. */
async function readJson(req, limit = 32 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (_) { return null; } }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) return null;
  }
  try { return JSON.parse(raw || '{}'); } catch (_) { return null; }
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Only allow browser calls from our own site (same host). Blocks other
 * websites from embedding our chatbot on our OpenAI bill.
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return o.host === host;
  } catch (_) {
    return false;
  }
}

/**
 * Best-effort in-memory rate limiter (per server instance). Combined with
 * the monthly budget cap in the OpenAI dashboard, it keeps costs bounded.
 */
function rateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(ts => now - ts < windowMs);
    if (arr.length >= limit) { hits.set(key, arr); return false; }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();       // keep memory bounded
    return true;
  };
}

module.exports = { readJson, sendJson, clientIp, sameOrigin, rateLimiter };
