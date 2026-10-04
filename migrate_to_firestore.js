/**
 * migrate_to_firestore.js
 *
 * One-time migration script: reads the CSV guest list and uploads
 * every guest to Firestore as a plain-text, human-readable document.
 *
 * *** ZERO NPM DEPENDENCIES — uses only Node.js built-in modules ***
 * Authenticates via the Firestore REST API with a service account JWT.
 *
 * Prerequisites:
 *   1. Download a service-account key JSON from Firebase Console:
 *      Firebase Console → Project Settings → Service Accounts → Generate New Private Key
 *   2. Save it as  service-account-key.json  in the project root
 *      (already gitignored — never commit this file)
 *
 * Usage:
 *   node migrate_to_firestore.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// ── Configuration ─────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account-key.json');
const CSV_PATH = path.join(__dirname, 'media', 'wedding_guest_list_july3.csv');
const PROJECT_ID = 'wedding-website-backend-5a8df';
const GUESTS_COLLECTION = 'guests';
const EXISTING_RSVP_COLLECTION = 'rsvp_guests';

// ── HTTP helper (zero-dependency) ─────────────────────────────
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

// ── Google OAuth2: service-account JWT → access token ─────────
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

// ── Firestore REST helpers ────────────────────────────────────
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Convert a JS value to a Firestore Value object
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

// Convert a Firestore document to a plain JS object
function fromFirestoreDoc(doc) {
  const result = {};
  if (!doc.fields) return result;
  for (const [key, val] of Object.entries(doc.fields)) {
    result[key] = fromFirestoreValue(val);
  }
  return result;
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

async function firestoreGet(token, collectionPath) {
  const docs = [];
  let pageToken = '';

  do {
    const url = `${FIRESTORE_BASE}/${collectionPath}?pageSize=300` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await httpsRequest(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

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

// ── CSV Parser ────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────
async function main() {
  // 1. Load service account
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('\n❌ Service account key not found at:', SERVICE_ACCOUNT_PATH);
    console.error('\nTo create one:');
    console.error('  1. Go to https://console.firebase.google.com/project/wedding-website-backend-5a8df/settings/serviceaccounts/adminsdk');
    console.error('  2. Click "Generate New Private Key"');
    console.error('  3. Save the downloaded JSON as "service-account-key.json" in the project root\n');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  console.log('\n🔑 Authenticating with service account:', serviceAccount.client_email);
  const token = await getAccessToken(serviceAccount);
  console.log('   ✓ Access token obtained\n');

  // 2. Parse CSV
  console.log('📄 Reading CSV:', CSV_PATH);
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(csvText);

  if (rows.length < 2) {
    console.error('❌ CSV has no data rows.');
    process.exit(1);
  }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col = name => headers.indexOf(name.toLowerCase());

  console.log(`   Found ${rows.length - 1} guests, ${headers.length} columns\n`);

  // Column indices
  const firstNameIdx = col('first name');
  const lastNameIdx = col('last name');
  const phoneIdx = col('phone number');
  const emailIdx = col('email');
  const address1Idx = col('address 1');
  const address2Idx = col('address 2');
  const cityIdx = col('city');
  const stateIdx = col('state');
  const postalCodeIdx = col('postal code');
  const countryIdx = col('country');
  const tagsIdx = col('tags');
  const envelopeNameIdx = col('envelope name');
  const partyIdx = col('party');

  const weddingIdx = col('wedding');
  const haldiIdx = col('haldi');
  const ganeshPujaIdx = col('ganesh puja');
  const sangeetIdx = col('sangeet');
  const receptionIdx = col('reception');
  const satyaPujaIdx = col('satya puja');
  const balajiIdx = col('balaji kalyanam');

  const nutAllergyIdx = col('nut allergy');
  const dietaryIdx = col('dietary restrictions');
  const emailAddressIdx = headers.lastIndexOf('email address') !== -1
    ? headers.lastIndexOf('email address')
    : headers.indexOf('email address');
  const phoneLastIdx = headers.lastIndexOf('phone number');

  // 3. Fetch existing RSVP data from Firestore backup
  console.log('🔥 Fetching existing RSVP data from "rsvp_guests" collection...');
  let existingRsvps = {};
  try {
    const docs = await firestoreGet(token, EXISTING_RSVP_COLLECTION);
    for (const doc of docs) {
      existingRsvps[doc.id] = doc.data;
    }
    console.log(`   Found ${Object.keys(existingRsvps).length} existing RSVP records\n`);
  } catch (err) {
    console.warn('   ⚠ Could not read rsvp_guests collection:', err.message);
    console.warn('   Proceeding with CSV data only.\n');
  }

  // 4. Build Firestore write operations
  console.log('📤 Building upload to "guests" collection...\n');

  const EVENT_MAP = {
    'Ganesh Puja': ganeshPujaIdx,
    'Haldi': haldiIdx,
    'Sangeet': sangeetIdx,
    'Wedding': weddingIdx,
    'Reception': receptionIdx,
    'Satyanarayana Puja': satyaPujaIdx,
    'Atlanta Reception': balajiIdx,
  };

  const writes = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const firstName = (row[firstNameIdx] || '').trim();
    const lastName = (row[lastNameIdx] || '').trim();

    if (!firstName) continue;

    const docId = (firstName + '_' + lastName).toLowerCase().replace(/\s+/g, '_');

    // Build RSVP map
    const rsvp = {};
    for (const [eventName, colIndex] of Object.entries(EVENT_MAP)) {
      if (colIndex === -1) continue;
      const val = (row[colIndex] || '').trim().toLowerCase();
      if (val) {
        if (val === 'attending' || val === 'accepted') rsvp[eventName] = 'accepted';
        else if (val === 'not attending' || val === 'declined') rsvp[eventName] = 'declined';
        else rsvp[eventName] = val;
      }
    }

    // Parse tags → events array
    const tagsStr = (row[tagsIdx] || '').trim();
    const events = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    const normalizedEvents = events.map(e => {
      if (e === 'Sat Puja') return 'Satyanarayana Puja';
      return e;
    });

    // Build the document (plain text, human-readable)
    const doc = {
      firstName,
      lastName,
      party: (row[partyIdx] || '').trim(),
      envelopeName: (row[envelopeNameIdx] || '').trim(),
      tags: tagsStr,
      events: normalizedEvents,
      rsvp,
      address1: (row[address1Idx] || '').trim(),
      address2: (row[address2Idx] || '').trim(),
      city: (row[cityIdx] || '').trim(),
      state: (row[stateIdx] || '').trim(),
      postalCode: (row[postalCodeIdx] || '').trim(),
      country: (row[countryIdx] || '').trim(),
      originalPhone: phoneIdx !== -1 ? (row[phoneIdx] || '').trim() : '',
      originalEmail: emailIdx !== -1 ? (row[emailIdx] || '').trim() : '',
      nutAllergy: nutAllergyIdx !== -1 ? (row[nutAllergyIdx] || '').trim() : '',
      dietaryRestrictions: dietaryIdx !== -1 ? (row[dietaryIdx] || '').trim() : '',
      email: emailAddressIdx !== -1 ? (row[emailAddressIdx] || '').trim() : '',
      phone: phoneLastIdx !== -1 && phoneLastIdx !== phoneIdx ? (row[phoneLastIdx] || '').trim() : '',
      songRequests: '',
      rsvpStatus: Object.keys(rsvp).length > 0 ? 'submitted' : '',
      rsvpTimestamp: '',
    };

    // Merge existing Firestore RSVP data
    const existing = existingRsvps[docId];
    if (existing) {
      if (existing.rsvp && typeof existing.rsvp === 'object' && Object.keys(existing.rsvp).length > 0) {
        Object.assign(doc.rsvp, existing.rsvp);
      }
      if (existing.nutAllergy) doc.nutAllergy = existing.nutAllergy;
      if (existing.dietaryRestrictions) doc.dietaryRestrictions = existing.dietaryRestrictions;
      if (existing.songRequests) doc.songRequests = existing.songRequests;
      if (existing.email) doc.email = existing.email;
      if (existing.phone) doc.phone = existing.phone;
      if (existing.rsvpTimestamp) { doc.rsvpTimestamp = existing.rsvpTimestamp; doc.rsvpStatus = 'submitted'; }
      console.log(`   ✓ Merged RSVP data for: ${firstName} ${lastName}`);
    }

    // Build Firestore write operation
    const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/${GUESTS_COLLECTION}/${docId}`;
    const fields = {};
    for (const [k, v] of Object.entries(doc)) {
      fields[k] = toFirestoreValue(v);
    }

    writes.push({
      update: {
        name: docPath,
        fields,
      },
    });
  }

  // 5. Execute batch writes
  console.log(`\n📤 Uploading ${writes.length} guests...\n`);
  await firestoreBatchWrite(token, writes);

  console.log(`\n✅ Migration complete!`);
  console.log(`   ${writes.length} guests uploaded to "${GUESTS_COLLECTION}" collection`);
  console.log(`   ${Object.keys(existingRsvps).length} RSVP records merged from "${EXISTING_RSVP_COLLECTION}"`);
  console.log(`\nFirebase Console: https://console.firebase.google.com/project/${PROJECT_ID}/firestore\n`);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
