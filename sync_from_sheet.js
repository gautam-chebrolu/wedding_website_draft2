/**
 * sync_from_sheet.js
 *
 * Re-syncs the Firestore "guests" collection from the live Google Sheet.
 * Run this whenever you edit guest information in the Sheet (names, parties,
 * invites/tags, addresses, or the GroupLookup tab).
 *
 * Reads two tabs of the wedding Sheet:
 *   • "Guests"      — one row per person (the roster)
 *   • "GroupLookup" — Name → Group, the high-level grouping used by tracking.html
 *
 * *** ZERO NPM DEPENDENCIES — uses only Node.js built-in modules ***
 *
 * Prerequisites:
 *   1. service-account-key.json in the project root (gitignored).
 *   2. The Sheet must be shared as "Anyone with the link → Viewer".
 *
 * Usage:
 *   node sync_from_sheet.js --dry-run     # show what would change, write nothing
 *   node sync_from_sheet.js               # sync roster fields + groupName
 *   node sync_from_sheet.js --groups-only # only refresh groupName
 *   node sync_from_sheet.js --sheet-wins  # Sheet also overrides RSVP answers
 *   node sync_from_sheet.js --full        # ...and blank Sheet cells erase Firestore values
 *   node sync_from_sheet.js --prune       # ALSO delete Firestore docs missing from the Sheet
 *
 * Which side wins
 * ---------------
 * ROSTER fields always come from the Sheet (it is the source of truth for who
 * is invited to what):
 *   firstName, lastName, party, groupName, envelopeName, displayName,
 *   tags, events, address1, address2, city, state, postalCode, country
 *
 * RSVP fields need a choice, because the website writes RSVPs straight to
 * Firestore and only mirrors them to the Sheet best-effort:
 *   rsvp, rsvpStatus, rsvpTimestamp, nutAllergy, dietaryRestrictions,
 *   songRequests, email, phone
 *
 *   (default)      Firestore wins. The Sheet only fills in fields Firestore
 *                  leaves blank, so a submitted RSVP is never overwritten.
 *   --sheet-wins   The Sheet wins wherever it has a value, but a blank Sheet
 *                  cell leaves a populated Firestore field alone. Use this
 *                  after editing RSVPs by hand in the Sheet.
 *   --full         The Sheet wins absolutely, blanks included. This ERASES
 *                  Firestore values whose Sheet cell is empty — including the
 *                  phone numbers that came from the original CSV import and
 *                  were never copied into the Sheet. Rarely what you want.
 */

const {
  PROJECT_ID,
  fetchSheetTab,
  loadServiceAccount,
  getAccessToken,
  firestoreGet,
  firestoreBatchWrite,
  buildMergeWrite,
  buildDelete,
  parseCSV,
  guestDocId,
  nameKey,
  normalizeEventName,
  parseGroupLookup,
  resolveGroups,
} = require('./firestore_rest');

const GUESTS_COLLECTION = 'guests';

// Sheet column name per canonical event name
const EVENT_COLUMN_MAP = {
  'Ganesh Puja': 'ganesh puja',
  'Haldi': 'haldi',
  'Sangeet': 'sangeet',
  'Wedding': 'wedding',
  'Reception': 'reception',
  'Satyanarayana Puja': 'satya puja',
  'Atlanta Reception': 'balaji kalyanam',
};

// Fields the Sheet owns outright
const ROSTER_FIELDS = [
  'firstName', 'lastName', 'party', 'groupName', 'envelopeName', 'displayName',
  'tags', 'events', 'address1', 'address2', 'city', 'state', 'postalCode', 'country',
];

// Fields Firestore owns; the Sheet only backfills blanks (unless --full)
const RSVP_FIELDS = [
  'rsvp', 'rsvpStatus', 'rsvpTimestamp', 'nutAllergy', 'dietaryRestrictions',
  'songRequests', 'email', 'phone',
];

// ── CLI flags ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-n');
const FULL = args.includes('--full');
const SHEET_WINS = args.includes('--sheet-wins') || FULL;
const GROUPS_ONLY = args.includes('--groups-only');
const PRUNE = args.includes('--prune');

// ── Sheet → guest record ──────────────────────────────────────
function parseGuestsTab(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('Guests tab has no data rows.');

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col = name => headers.indexOf(name);

  const idx = {
    firstName: col('first name'),
    lastName: col('last name'),
    envelopeName: col('envelope name'),
    displayName: col('display name'),
    party: col('party'),
    tags: col('tags'),
    nutAllergy: col('nut allergy'),
    dietary: col('dietary restrictions'),
    songRequests: col('song requests'),
    email: col('email address'),
    phone: col('phone number'),
    rsvpStatus: col('rsvp status'),
    rsvpTimestamp: col('rsvp timestamp'),
    address1: col('address 1'),
    address2: col('address 2'),
    city: col('city'),
    state: col('state'),
    postalCode: col('postal code'),
    country: col('country'),
  };

  if (idx.firstName === -1 || idx.lastName === -1) {
    throw new Error('Guests tab must have "first name" and "last name" columns.');
  }

  const get = (row, i) => (i === -1 ? '' : (row[i] || '').toString().trim());

  const guests = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const firstName = get(row, idx.firstName);
    const lastName = get(row, idx.lastName);
    if (!firstName) continue;

    // Per-event RSVP answers
    const rsvp = {};
    for (const [eventName, colName] of Object.entries(EVENT_COLUMN_MAP)) {
      const ci = headers.indexOf(colName);
      if (ci === -1) continue;
      const val = get(row, ci).toLowerCase();
      if (!val) continue;
      if (val === 'attending' || val === 'accepted') rsvp[eventName] = 'accepted';
      else if (val === 'not attending' || val === 'declined') rsvp[eventName] = 'declined';
      else rsvp[eventName] = val;
    }

    const tags = get(row, idx.tags);
    const events = tags
      ? tags.split(',').map(t => normalizeEventName(t.trim())).filter(Boolean)
      : [];

    guests.push({
      firstName,
      lastName,
      party: get(row, idx.party),
      envelopeName: get(row, idx.envelopeName),
      displayName: get(row, idx.displayName),
      tags,
      events,
      rsvp,
      rsvpStatus: get(row, idx.rsvpStatus),
      rsvpTimestamp: get(row, idx.rsvpTimestamp),
      nutAllergy: get(row, idx.nutAllergy),
      dietaryRestrictions: get(row, idx.dietary),
      songRequests: get(row, idx.songRequests),
      email: get(row, idx.email),
      phone: get(row, idx.phone),
      address1: get(row, idx.address1),
      address2: get(row, idx.address2),
      city: get(row, idx.city),
      state: get(row, idx.state),
      postalCode: get(row, idx.postalCode),
      country: get(row, idx.country),
    });
  }
  return guests;
}

// ── Change detection ──────────────────────────────────────────
function isEmpty(v) {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = a || [], bb = b || [];
    return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => a[k] === b[k]);
  }
  return (a ?? '') === (b ?? '');
}

function shortValue(v) {
  if (Array.isArray(v)) return '[' + v.join(', ') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.entries(v).map(([k, x]) => `${k}:${x}`).join(', ') + '}';
  }
  return v === '' ? '(blank)' : String(v);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const mode = GROUPS_ONLY ? 'groups-only'
    : FULL ? 'full — Sheet wins absolutely, BLANKS ERASE'
    : SHEET_WINS ? 'sheet-wins — Sheet wins where non-blank'
    : 'roster — Firestore keeps its RSVPs';
  console.log(`\n🔄 Sheet → Firestore sync   [mode: ${mode}${DRY_RUN ? ', DRY RUN' : ''}]\n`);

  // 1. Auth
  const serviceAccount = loadServiceAccount();
  console.log('🔑 Authenticating as:', serviceAccount.client_email);
  const token = await getAccessToken(serviceAccount);
  console.log('   ✓ Access token obtained\n');

  // 2. Pull both Sheet tabs
  console.log('📄 Downloading Sheet tabs...');
  const [guestsCsv, groupCsv] = await Promise.all([
    fetchSheetTab('Guests'),
    fetchSheetTab('GroupLookup'),
  ]);

  const sheetGuests = parseGuestsTab(guestsCsv);
  const lookup = parseGroupLookup(groupCsv);
  console.log(`   ✓ Guests tab: ${sheetGuests.length} rows`);
  console.log(`   ✓ GroupLookup tab: ${lookup.size} entries\n`);

  // 3. Resolve each guest's group name
  const { groups, unresolved } = resolveGroups(sheetGuests, lookup);
  for (const g of sheetGuests) {
    g.groupName = groups.get(nameKey(g.firstName, g.lastName)) || '';
  }
  if (unresolved.length) {
    console.log(`⚠  ${unresolved.length} guest(s) have no group in GroupLookup (left blank):`);
    unresolved.forEach(n => console.log('     • ' + n));
    console.log('');
  }

  // 3b. Guard against two different people mapping to the same document id.
  // The id is firstname_lastname, so two guests with identical names collide —
  // they would overwrite each other here AND the website lookup would conflate
  // them. Keep the first row and skip the rest, loudly.
  const byDocId = new Map();
  const duplicates = [];
  const uniqueGuests = [];
  for (const g of sheetGuests) {
    const docId = guestDocId(g.firstName, g.lastName);
    if (byDocId.has(docId)) {
      duplicates.push({ docId, kept: byDocId.get(docId), skipped: g });
      continue;
    }
    byDocId.set(docId, g);
    uniqueGuests.push(g);
  }
  if (duplicates.length) {
    console.log(`🛑 ${duplicates.length} duplicate name(s) in the Guests tab — these collide on one`);
    console.log('   Firestore document id, so only the FIRST row is synced and the website');
    console.log('   cannot tell them apart. Fix this in the Sheet (e.g. add a middle initial):');
    for (const d of duplicates) {
      console.log(`     • ${d.docId}`);
      console.log(`         kept:    party "${d.kept.party}", tags "${d.kept.tags}"`);
      console.log(`         SKIPPED: party "${d.skipped.party}", tags "${d.skipped.tags}"`);
    }
    console.log('');
  }

  // 4. Read current Firestore state
  console.log('🔥 Reading current "guests" collection...');
  const existingDocs = await firestoreGet(token, GUESTS_COLLECTION);
  const existing = new Map(existingDocs.map(d => [d.id, d.data]));
  console.log(`   ✓ ${existing.size} documents in Firestore\n`);

  // 5. Diff and build writes
  const writes = [];
  const created = [];
  const updated = [];
  const seenIds = new Set();

  for (const g of uniqueGuests) {
    const docId = guestDocId(g.firstName, g.lastName);
    seenIds.add(docId);
    const current = existing.get(docId);

    // Desired values for every field this run is allowed to touch
    const desired = {};
    const fields = GROUPS_ONLY ? ['groupName'] : ROSTER_FIELDS;
    for (const f of fields) desired[f] = g[f];

    if (!GROUPS_ONLY) {
      for (const f of RSVP_FIELDS) {
        const sheetVal = g[f];
        const fsVal = current ? current[f] : undefined;

        if (FULL) {
          // Sheet wins absolutely — blank cells erase Firestore values too
          desired[f] = sheetVal;
        } else if (SHEET_WINS) {
          // Sheet wins where it has something to say; blanks leave Firestore alone
          if (!isEmpty(sheetVal)) desired[f] = sheetVal;
        } else if (!current || isEmpty(fsVal)) {
          // Firestore wins; the Sheet only backfills blanks
          if (!isEmpty(sheetVal)) desired[f] = sheetVal;
        }
      }
      // New documents need the fields the Sheet doesn't carry
      if (!current) {
        desired.originalPhone = '';
        desired.originalEmail = '';
        if (desired.rsvpStatus === undefined) {
          desired.rsvpStatus = Object.keys(g.rsvp).length > 0 ? 'submitted' : '';
        }
      }
    }

    if (!current) {
      created.push(`${g.firstName} ${g.lastName}  [${docId}]`);
      writes.push(buildMergeWrite(GUESTS_COLLECTION, docId, desired));
      continue;
    }

    // Keep only genuinely changed fields
    const changed = {};
    const diffs = [];
    for (const [k, v] of Object.entries(desired)) {
      if (!sameValue(current[k], v)) {
        changed[k] = v;
        diffs.push(`${k}: ${shortValue(current[k])} → ${shortValue(v)}`);
      }
    }

    if (Object.keys(changed).length > 0) {
      updated.push({ name: `${g.firstName} ${g.lastName}`, docId, diffs });
      writes.push(buildMergeWrite(GUESTS_COLLECTION, docId, changed));
    }
  }

  // 6. Report
  const orphans = [...existing.keys()].filter(id => !seenIds.has(id));

  if (created.length) {
    console.log(`➕ ${created.length} guest(s) in the Sheet but not in Firestore (will be created):`);
    created.forEach(n => console.log('     • ' + n));
    console.log('');
  }

  if (updated.length) {
    console.log(`✏️  ${updated.length} guest(s) with changes:`);
    for (const u of updated) {
      console.log(`     • ${u.name}`);
      u.diffs.forEach(d => console.log(`         ${d}`));
    }
    console.log('');
  }

  if (orphans.length) {
    console.log(`⚠  ${orphans.length} Firestore document(s) not present in the Sheet:`);
    for (const id of orphans) {
      const d = existing.get(id) || {};
      const hasRsvp = d.rsvp && Object.keys(d.rsvp).length > 0;
      console.log(`     • ${id}` +
        (d.party ? `  (party: ${d.party})` : '') +
        (hasRsvp ? '  ⚠ HAS SUBMITTED RSVP DATA' : ''));
    }
    if (PRUNE) {
      console.log('   --prune given: these will be DELETED.\n');
      orphans.forEach(id => writes.push(buildDelete(GUESTS_COLLECTION, id)));
    } else {
      console.log('   Not deleted. These are usually old spellings of a renamed guest —');
      console.log('   re-run with --prune to delete them once you have checked the list.\n');
    }
  }

  if (writes.length === 0) {
    console.log('✅ Everything is already in sync — nothing to write.\n');
    return;
  }

  // 7. Write
  if (DRY_RUN) {
    console.log(`🟡 DRY RUN — ${writes.length} write(s) withheld.`);
    console.log('   Re-run without --dry-run to apply.\n');
    return;
  }

  console.log(`📤 Applying ${writes.length} write(s)...\n`);
  await firestoreBatchWrite(token, writes);

  console.log(`\n✅ Sync complete — ${created.length} created, ${updated.length} updated.`);
  console.log(`\nFirebase Console: https://console.firebase.google.com/project/${PROJECT_ID}/firestore\n`);
}

main().catch(err => {
  console.error('\n❌ Sync failed:', err.message || err);
  process.exit(1);
});
