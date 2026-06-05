const fs = require('fs');

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i); // hash * 33 ^ c
  }
  return (hash >>> 0).toString(16);
}

function encrypt(text, key) {
  let xored = "";
  for (let i = 0; i < text.length; i++) {
    xored += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(xored, 'binary').toString('base64');
}

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
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  // Resolve column indices from header row (case-insensitive, trimmed)
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col = name => headers.indexOf(name.toLowerCase());

  const firstNameIdx = col('first name');
  const lastNameIdx  = col('last name');
  const tagsIdx      = col('tags');

  if (firstNameIdx === -1 || lastNameIdx === -1 || tagsIdx === -1) {
    throw new Error(
      `Could not find required columns. Found headers: ${headers.join(', ')}`
    );
  }

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const firstName = (row[firstNameIdx] || '').trim();
    const lastName  = (row[lastNameIdx]  || '').trim();
    const tags      = (row[tagsIdx]      || '').trim();
    if (firstName !== '') {
      data.push({ firstName, lastName, tags });
    }
  }
  return data;
}

const PASSWORD = "pg2026";
const csv = fs.readFileSync('media/wedding_guest_list_june4.csv', 'utf8');
const parsed = parseCSV(csv);

const secureData = {};

parsed.forEach(guest => {
  const normalizedName = guest.firstName.toLowerCase() + " " + guest.lastName.toLowerCase();
  const nameHash = hashString(normalizedName);
  const encryptionKey = normalizedName + PASSWORD;
  
  const payload = guest.firstName + "|" + guest.tags;
  const encryptedTags = encrypt(payload, encryptionKey);
  secureData[nameHash] = encryptedTags;
});

const jsOutput = `const GUEST_DATA_SECURE = ${JSON.stringify(secureData, null, 2)};\n`;
fs.writeFileSync('media/guest_data.js', jsOutput);

console.log("Successfully encrypted guest data to media/guest_data.js");
