/**
 * firestore_rest.js
 *
 * Shared, zero-dependency helpers for talking to Firestore (and Google Sheets)
 * from plain Node.js. Used by migrate_to_firestore.js and sync_from_sheet.js.
 *
 * *** ZERO NPM DEPENDENCIES — uses only Node.js built-in modules ***
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const PROJECT_ID = 'wedding-website-backend-5a8df';
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account-key.json');
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Google Sheet that backs the RSVP system
const SHEET_ID = '1uhaj2KtL1z6O-7Vx3NSdpAY-UuGBetbAP3jBpZhc_Xg';

// ── HTTP helpers (zero-dependency) ────────────────────────────
function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Plain GET that follows redirects and returns the raw text body.
// (Google Sheets CSV export redirects to googleusercontent.com.)
function httpsGetText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        res.resume();
        return resolve(httpsGetText(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Download one tab of the wedding Google Sheet as CSV text.
 * The sheet must be shared as "anyone with the link can view".
 *
 * @param {string} tabName  e.g. 'Guests' or 'GroupLookup'
 */
function fetchSheetTab(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  return httpsGetText(url);
}

// ── Google OAuth2: service-account JWT → access token ─────────
function loadServiceAccount() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('\n❌ Service account key not found at:', SERVICE_ACCOUNT_PATH);
    console.error('\nTo create one:');
    console.error(`  1. Go to https://console.firebase.google.com/project/${PROJECT_ID}/settings/serviceaccounts/adminsdk`);
    console.error('  2. Click "Generate New Private Key"');
    console.error('  3. Save the downloaded JSON as "service-account-key.json" in the project root\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  const jwt = header + '.' + payload + '.' + signature;

  const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
    '&assertion=' + encodeURIComponent(jwt);

  const res = await httpsRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);

  if (!res.body.access_token) {
    throw new Error('OAuth failed: ' + JSON.stringify(res.body));
  }
  return res.body.access_token;
}

// ── Firestore value conversion ────────────────────────────────
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in val) {
    const result = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      result[k] = fromFirestoreValue(v);
    }
    return result;
  }
  return null;
}

function fromFirestoreDoc(doc) {
  const result = {};
  if (!doc.fields) return result;
  for (const [key, val] of Object.entries(doc.fields)) {
    result[key] = fromFirestoreValue(val);
  }
  return result;
}

// ── Firestore read / write ────────────────────────────────────
async function firestoreGet(token, collectionPath) {
  const docs = [];
  let pageToken = '';

  do {
    const url = `${FIRESTORE_BASE}/${collectionPath}?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await httpsRequest(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status !== 200) {
      throw new Error(`Read of "${collectionPath}" failed (${res.status}): ` +
        JSON.stringify(res.body).slice(0, 300));
    }

    if (res.body.documents) {
      for (const doc of res.body.documents) {
        const id = doc.name.split('/').pop();
        docs.push({ id, data: fromFirestoreDoc(doc) });
      }
    }
    pageToken = res.body.nextPageToken || '';
  } while (pageToken);

  return docs;
}

async function firestoreBatchWrite(token, writes) {
  // Firestore batch limit: 500 operations
  const BATCH_SIZE = 400;
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writes.slice(i, i + BATCH_SIZE);
    const body = JSON.stringify({ writes: batch });

    const res = await httpsRequest(`${FIRESTORE_BASE}:batchWrite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);

    if (res.status !== 200) {
      console.error('Batch write error:', JSON.stringify(res.body).slice(0, 500));
      throw new Error(`Batch write failed with status ${res.status}`);
    }

    console.log(`   Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, writes.length)}/${writes.length} ops)`);
  }
}

/**
 * Build a batchWrite operation that writes ONLY the given fields, leaving
 * every other field on the document untouched (merge semantics).
 */
function buildMergeWrite(collection, docId, fieldsObj) {
  const fields = {};
  for (const [k, v] of Object.entries(fieldsObj)) {
    fields[k] = toFirestoreValue(v);
  }
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`,
      fields,
    },
    updateMask: { fieldPaths: Object.keys(fieldsObj) },
  };
}

/** Build a batchWrite operation that replaces the whole document. */
function buildFullWrite(collection, docId, fieldsObj) {
  const fields = {};
  for (const [k, v] of Object.entries(fieldsObj)) {
    fields[k] = toFirestoreValue(v);
  }
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`,
      fields,
    },
  };
}

/** Build a batchWrite operation that deletes a document. */
function buildDelete(collection, docId) {
  return { delete: `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}` };
}

// ── CSV parser ────────────────────────────────────────────────
function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentVal);
        if (currentRow.some(v => v.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    if (currentRow.some(v => v.trim() !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

// ── Shared domain helpers ─────────────────────────────────────

/** Firestore document id for a guest — must match schedule.js / tracking.html. */
function guestDocId(firstName, lastName) {
  return (firstName + '_' + lastName).toLowerCase().replace(/\s+/g, '_');
}

/** Normalised key for matching a person's full name across tabs. */
function nameKey(firstName, lastName) {
  return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Tag names used in the Tags column → canonical event names. */
function normalizeEventName(tag) {
  if (tag === 'Sat Puja') return 'Satyanarayana Puja';
  return tag;
}

/**
 * Parse the "GroupLookup" tab (columns: Name, Group) into a
 * Map<normalised full name, group name>.
 */
function parseGroupLookup(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return new Map();

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const groupIdx = headers.indexOf('group');
  if (nameIdx === -1 || groupIdx === -1) {
    throw new Error('GroupLookup tab must have "Name" and "Group" columns; got: ' + headers.join(', '));
  }

  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][nameIdx] || '').trim();
    const group = (rows[i][groupIdx] || '').trim();
    if (!name || !group) continue;
    map.set(name.toLowerCase().replace(/\s+/g, ' '), group);
  }
  return map;
}

/**
 * Resolve each guest's group name.
 *
 * 1. Exact full-name match against the GroupLookup tab.
 * 2. Fall back to the most common group among other members of the same party
 *    (covers people listed in GroupLookup under a different surname, e.g. a
 *    maiden name).
 * 3. Otherwise '' — reported back to the caller as unresolved.
 *
 * @param {Array<{firstName,lastName,party}>} guests
 * @param {Map<string,string>} lookup
 * @returns {{ groups: Map<string,string>, unresolved: string[] }}
 *          groups is keyed by nameKey(firstName, lastName)
 */
function resolveGroups(guests, lookup) {
  const groups = new Map();
  const unmatched = [];

  for (const g of guests) {
    const key = nameKey(g.firstName, g.lastName);
    const direct = lookup.get(key);
    if (direct) groups.set(key, direct);
    else unmatched.push(g);
  }

  // Pass 2: inherit the dominant group of the guest's party
  const unresolved = [];
  for (const g of unmatched) {
    const key = nameKey(g.firstName, g.lastName);
    const tally = {};
    if (g.party) {
      for (const other of guests) {
        if (other === g || other.party !== g.party) continue;
        const otherGroup = groups.get(nameKey(other.firstName, other.lastName));
        if (otherGroup) tally[otherGroup] = (tally[otherGroup] || 0) + 1;
      }
    }
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (best) {
      groups.set(key, best[0]);
    } else {
      groups.set(key, '');
      unresolved.push(`${g.firstName} ${g.lastName}` + (g.party ? ` (party: ${g.party})` : ''));
    }
  }

  return { groups, unresolved };
}

module.exports = {
  PROJECT_ID,
  SHEET_ID,
  FIRESTORE_BASE,
  SERVICE_ACCOUNT_PATH,
  httpsRequest,
  httpsGetText,
  fetchSheetTab,
  loadServiceAccount,
  getAccessToken,
  toFirestoreValue,
  fromFirestoreValue,
  fromFirestoreDoc,
  firestoreGet,
  firestoreBatchWrite,
  buildMergeWrite,
  buildFullWrite,
  buildDelete,
  parseCSV,
  guestDocId,
  nameKey,
  normalizeEventName,
  parseGroupLookup,
  resolveGroups,
};
