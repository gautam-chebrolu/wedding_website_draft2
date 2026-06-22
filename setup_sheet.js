/**
 * setup_sheet.js
 * 
 * Reads the existing wedding guest CSV and outputs an enhanced version
 * with RSVP columns added, ready for import into Google Sheets.
 * 
 * Usage:  node setup_sheet.js
 * Output: media/wedding_guests_for_sheets.csv
 */

const fs = require('fs');

// ── Configuration ─────────────────────────────────────────────
const INPUT_CSV = 'media/wedding_guest_list_june14.csv';
const OUTPUT_CSV = 'media/wedding_guests_for_sheets.csv';

// Columns to append (these will be added after existing columns)
const NEW_COLUMNS = ['rsvp status', 'rsvp timestamp'];

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

// ── CSV Encoder ───────────────────────────────────────────────
function escapeCSV(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCSV(row) {
  return row.map(escapeCSV).join(',');
}

// ── Main ──────────────────────────────────────────────────────
const csvText = fs.readFileSync(INPUT_CSV, 'utf8');
const rows = parseCSV(csvText);

if (rows.length < 2) {
  console.error('CSV has no data rows.');
  process.exit(1);
}

// Add new column headers
const headers = rows[0];
const existingHeadersLower = headers.map(h => h.trim().toLowerCase());

for (const col of NEW_COLUMNS) {
  if (!existingHeadersLower.includes(col)) {
    headers.push(col);
  }
}

// Ensure all data rows have the same number of columns as headers
for (let i = 1; i < rows.length; i++) {
  while (rows[i].length < headers.length) {
    rows[i].push('');
  }
}

// Write output
const output = rows.map(rowToCSV).join('\n') + '\n';
fs.writeFileSync(OUTPUT_CSV, output, 'utf8');

console.log(`\n✓ Enhanced CSV written to: ${OUTPUT_CSV}`);
console.log(`  ${rows.length - 1} guests, ${headers.length} columns`);
console.log(`  New columns added: ${NEW_COLUMNS.join(', ')}`);
console.log(`\nNext steps:`);
console.log(`  1. Go to Google Sheets → File → Import → Upload`);
console.log(`  2. Select "${OUTPUT_CSV}"`);
console.log(`  3. Choose "Replace spreadsheet" and "Detect automatically"`);
console.log(`  4. Rename the sheet tab to "Guests"`);
console.log(`  5. Copy the Sheet ID from the URL and paste into Code.gs\n`);
