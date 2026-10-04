/**
 * migrate_to_firestore.js
 *
 * One-time migration script: reads the CSV guest list and uploads
 * every guest to Firestore as a plain-text, human-readable document.
 *
 * The high-level "groupName" for each guest (Gupta Family, Chebrolu Friends, …)
 * comes from the "GroupLookup" tab of the wedding Google Sheet, since the CSV
 * export does not carry it.
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
 *
 * NOTE: for ongoing updates use sync_from_sheet.js instead — it reads the live
 * Sheet, diffs against Firestore, and will not clobber RSVPs that guests have
 * already submitted through the website.
 */

const fs = require('fs');
const path = require('path');

const {
  PROJECT_ID,
  fetchSheetTab,
  loadServiceAccount,
  getAccessToken,
  firestoreGet,
  firestoreBatchWrite,
  buildFullWrite,
  parseCSV,
  guestDocId,
  nameKey,
  normalizeEventName,
  parseGroupLookup,
  resolveGroups,
} = require('./firestore_rest');

// ── Configuration ─────────────────────────────────────────────
const CSV_PATH = path.join(__dirname, 'media', 'wedding_guest_list_july3.csv');
const GUESTS_COLLECTION = 'guests';
const EXISTING_RSVP_COLLECTION = 'rsvp_guests';

// ── Main ──────────────────────────────────────────────────────
async function main() {
  // 1. Load service account
  const serviceAccount = loadServiceAccount();
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
  const displayNameIdx = col('display name');
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

  // 3. Pull the GroupLookup tab from the Google Sheet
  console.log('📄 Downloading "GroupLookup" tab from the Google Sheet...');
  let groupLookup = new Map();
  try {
    groupLookup = parseGroupLookup(await fetchSheetTab('GroupLookup'));
    console.log(`   ✓ ${groupLookup.size} name → group entries\n`);
  } catch (err) {
    console.warn('   ⚠ Could not read GroupLookup tab:', err.message);
    console.warn('   groupName will be left blank for every guest.\n');
  }

  // Resolve group names for every CSV row up front, so the party-level
  // fallback can see the whole roster.
  const roster = [];
  for (let i = 1; i < rows.length; i++) {
    const firstName = (rows[i][firstNameIdx] || '').trim();
    if (!firstName) continue;
    roster.push({
      firstName,
      lastName: (rows[i][lastNameIdx] || '').trim(),
      party: (rows[i][partyIdx] || '').trim(),
    });
  }
  const { groups, unresolved } = resolveGroups(roster, groupLookup);
  if (groupLookup.size && unresolved.length) {
    console.log(`⚠  ${unresolved.length} guest(s) have no group in GroupLookup (left blank):`);
    unresolved.forEach(n => console.log('     • ' + n));
    console.log('');
  }

  // 4. Fetch existing RSVP data from Firestore backup
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

  // 5. Build Firestore write operations
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

    const docId = guestDocId(firstName, lastName);

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
    const normalizedEvents = events.map(normalizeEventName);

    // Build the document (plain text, human-readable)
    const doc = {
      firstName,
      lastName,
      party: (row[partyIdx] || '').trim(),
      groupName: groups.get(nameKey(firstName, lastName)) || '',
      envelopeName: (row[envelopeNameIdx] || '').trim(),
      displayName: displayNameIdx !== -1 ? (row[displayNameIdx] || '').trim() : '',
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

    writes.push(buildFullWrite(GUESTS_COLLECTION, docId, doc));
  }

  // 6. Execute batch writes
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
