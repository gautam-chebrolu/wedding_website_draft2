/**
 * api/_lib/firestore_admin.js
 *
 * Minimal server-side Firestore writer for the live-admin endpoint.
 * Authenticates with a service account, which bypasses security rules,
 * so the public `live` collection can stay read-only for browsers.
 *
 * Credentials come only from FIREBASE_SERVICE_ACCOUNT, containing the full
 * service-account JSON (raw or base64). The local dev server loads the
 * gitignored key file into that variable before this module runs.
 */

const crypto = require('crypto');

const PROJECT_ID = 'wedding-website-backend-5a8df';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;   // { token, exp }

function loadServiceAccount() {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!env) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');

  const text = env.trim().startsWith('{') ? env : Buffer.from(env, 'base64').toString('utf8');
  const account = JSON.parse(text);
  if (!account || typeof account.client_email !== 'string' || typeof account.private_key !== 'string') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is invalid');
  }
  if (account.project_id && account.project_id !== PROJECT_ID) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT belongs to a different project');
  }
  return account;
}

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = loadServiceAccount();
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature
    })
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('Google auth failed: ' + JSON.stringify(json).slice(0, 200));
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.token;
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

/** Merge the given flat fields into collection/docId (creates it if missing). */
async function mergeDoc(collection, docId, fields) {
  const token = await getToken();
  const keys = Object.keys(fields);
  const mask = keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const body = { fields: {} };
  keys.forEach(k => { body.fields[k] = toValue(fields[k]); });

  const res = await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}?${mask}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Firestore write failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

module.exports = { mergeDoc };
