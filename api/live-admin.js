/**
 * POST /api/live-admin — update the live pages from your phone.
 *
 * Body: { password, event: 'sangeet'|'wedding', patch?: {...} }
 *   - No patch → just verifies the password (used by the login screen).
 *   - patch fields (all optional):
 *       banner        string   message shown to every guest ('' clears it)
 *       delayMinutes  int      0–180, shifts items from delayFromId onward
 *       delayFromId   string   schedule item id where the delay starts
 *       currentAct    int|null Sangeet act on stage (0-based), null = none
 *
 * Env vars: LIVE_ADMIN_PASSWORD, FIREBASE_SERVICE_ACCOUNT
 */

const crypto = require('crypto');
const LIVE = require('../media/live_schedule_data.js');
const { mergeDoc } = require('./_lib/firestore_admin');
const { readJson, sendJson, clientIp, sameOrigin, rateLimiter } = require('./_lib/http');

const allowAttempt = rateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

function passwordOk(given) {
  const expected = process.env.LIVE_ADMIN_PASSWORD || '';
  if (!expected || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function validatePatch(eventKey, patch) {
  const ev = LIVE[eventKey];
  const ids = ev.blocks.flatMap(b => b.items.map(i => i.id));
  const actCount = ev.blocks.flatMap(b => b.items).reduce((n, i) => Math.max(n, (i.acts || []).length), 0);
  const out = {};

  if ('banner' in patch) out.banner = String(patch.banner || '').trim().slice(0, 280);
  if ('delayMinutes' in patch) {
    const m = parseInt(patch.delayMinutes, 10);
    if (isNaN(m) || m < 0 || m > 180) throw new Error('Delay must be 0–180 minutes');
    out.delayMinutes = m;
  }
  if ('delayFromId' in patch) {
    if (patch.delayFromId && !ids.includes(patch.delayFromId)) throw new Error('Unknown schedule item');
    out.delayFromId = patch.delayFromId || '';
  }
  if ('currentAct' in patch) {
    if (patch.currentAct === null || patch.currentAct === -1) out.currentAct = null;
    else {
      const a = parseInt(patch.currentAct, 10);
      if (isNaN(a) || a < 0 || a >= actCount) throw new Error('Unknown act');
      out.currentAct = a;
    }
  }
  if (!Object.keys(out).length) throw new Error('Nothing to update');
  out.updatedAt = Date.now();
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Forbidden' });
  if (!allowAttempt(clientIp(req))) return sendJson(res, 429, { error: 'Too many attempts — wait a few minutes.' });

  if (!process.env.LIVE_ADMIN_PASSWORD) {
    return sendJson(res, 503, { error: 'LIVE_ADMIN_PASSWORD is not configured on the server.' });
  }

  const body = await readJson(req);
  if (!body || !passwordOk(body.password)) return sendJson(res, 401, { error: 'Wrong password' });

  const eventKey = body.event;
  if (!LIVE[eventKey]) return sendJson(res, 400, { error: 'Unknown event' });
  if (!body.patch) return sendJson(res, 200, { ok: true });

  let fields;
  try { fields = validatePatch(eventKey, body.patch); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }

  try {
    await mergeDoc('live', eventKey, fields);
    return sendJson(res, 200, { ok: true, saved: fields });
  } catch (e) {
    console.error('live-admin write failed:', e.message);
    return sendJson(res, 500, { error: 'Could not save — check FIREBASE_SERVICE_ACCOUNT on the server.' });
  }
};
