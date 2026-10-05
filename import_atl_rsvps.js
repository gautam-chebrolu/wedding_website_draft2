// One-time importer: Google Sheet "ATL RSVPs" tab -> Firestore atl_rsvps.
// Document IDs are deterministic, so re-running this safely updates the same
// imported rows instead of creating duplicates.
const crypto = require('crypto');
const firestore = require('./firestore_rest');

function documentId(row) {
  const fingerprint = [row.timestamp, row.name, row.guests, row.phone, row.email].join('|');
  return 'sheet_atl_' + crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
}

(async () => {
  const csv = await firestore.fetchSheetTab('ATL RSVPs');
  const [header, ...rows] = firestore.parseCSV(csv);
  const fields = Object.fromEntries(header.map((name, index) => [name.trim().toLowerCase(), index]));
  for (const name of ['timestamp', 'name', 'guests', 'phone', 'email']) {
    if (fields[name] === undefined) throw new Error(`Missing required column: ${name}`);
  }

  const entries = rows.map(row => ({
    timestamp: (row[fields.timestamp] || '').trim(),
    name: (row[fields.name] || '').trim(),
    guests: Number.parseInt(row[fields.guests], 10) || 1,
    phone: (row[fields.phone] || '').trim(),
    email: (row[fields.email] || '').trim(),
  })).filter(row => row.timestamp && row.name);

  const token = await firestore.getAccessToken(firestore.loadServiceAccount());
  const writes = entries.map(row => firestore.buildFullWrite('atl_rsvps', documentId(row), {
    ...row,
    source: 'google-sheet-atl-rsvps',
  }));
  await firestore.firestoreBatchWrite(token, writes);
  console.log(`Imported ${entries.length} ATL RSVP rows into atl_rsvps.`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
