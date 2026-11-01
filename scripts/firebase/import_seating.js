/**
 * import_seating.js
 *
 * Uploads the reception seating chart CSV to Firestore so the
 * "Find Your Seat" widget on /wedding can search it.
 *
 *   node scripts/firebase/import_seating.js            (uses the default CSV below)
 *   node scripts/firebase/import_seating.js path\to\file.csv
 *   node scripts/firebase/import_seating.js --dry-run  (parse + report, write nothing)
 *
 * Expected columns: Full Name, First Name, Last Name, <extra>, Table
 * (the unnamed 4th column holds a third name part / "Jr." etc.)
 *
 * Stored as ONE document — seating/reception — with a `rows` array, so
 * guests download the whole chart in a single fast read.
 * Re-run any time the chart changes; it fully replaces the document.
 *
 * Requires service-account-key.json in the project root (gitignored).
 */

const fs = require('fs');
const path = require('path');
const firestore = require('./firestore_rest');

const DEFAULT_CSV = path.resolve(__dirname, '..', '..', 'media', 'Reception Seating Chart - A-Z Seating Chart.csv');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvPath = args.find(a => !a.startsWith('--')) || DEFAULT_CSV;

function normTable(t) {
  return String(t || '').trim().replace(/\s+/g, ' ').replace(/^ht\s*(\d+)$/i, 'HT $1');
}

(async () => {
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const rows = firestore.parseCSV(text);
  const header = rows[0].map(h => h.trim().toLowerCase());

  const col = name => header.indexOf(name);
  const iFull = col('full name'), iFirst = col('first name'), iLast = col('last name'), iTable = col('table');
  if (iFull < 0 || iTable < 0) throw new Error('CSV needs "Full Name" and "Table" columns; got: ' + header.join(', '));
  const iExtra = header.findIndex((h, i) => h === '' && i !== iTable);

  const out = [];
  const problems = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const n = (row[iFull] || '').trim().replace(/\s+/g, ' ');
    const t = normTable(row[iTable]);
    if (!n) continue;
    if (!t) { problems.push(`Row ${r + 1}: "${n}" has no table`); continue; }
    const rec = { n, f: (row[iFirst] || '').trim(), l: (row[iLast] || '').trim(), t };
    const x = iExtra >= 0 ? (row[iExtra] || '').trim() : '';
    if (x) rec.x = x;
    out.push(rec);
  }

  const dupes = out.map(r => r.n.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i);
  const tables = {};
  out.forEach(r => { tables[r.t] = (tables[r.t] || 0) + 1; });

  console.log(`\nParsed ${out.length} guests across ${Object.keys(tables).length} tables from ${path.basename(csvPath)}`);
  console.log('Tables:', Object.entries(tables).map(([t, c]) => `${t}=${c}`).join(', '));
  if (dupes.length) console.log('⚠ Duplicate names (both will show in search):', [...new Set(dupes)].join(', '));
  problems.forEach(p => console.log('⚠', p));

  if (dryRun) { console.log('\n(dry run — nothing written)'); return; }

  const token = await firestore.getAccessToken(firestore.loadServiceAccount());
  await firestore.firestoreBatchWrite(token, [
    firestore.buildFullWrite('seating', 'reception', { rows: out, updatedAt: new Date().toISOString(), count: out.length })
  ]);
  console.log(`\n✅ Uploaded seating/reception (${out.length} guests)`);
})().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
