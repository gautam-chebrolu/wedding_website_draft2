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

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length >= 3 && row[0].trim() !== '') {
      data.push({
        firstName: row[0].trim(),
        lastName: row[1].trim(),
        tags: row[2] ? row[2].trim() : ''
      });
    }
  }
  return data;
}

const PASSWORD = "pg2026";
const csv = fs.readFileSync('media/wedding_guest_list.csv', 'utf8');
const parsed = parseCSV(csv);

const secureData = {};

parsed.forEach(guest => {
  const normalizedName = guest.firstName.toLowerCase() + " " + guest.lastName.toLowerCase();
  const nameHash = hashString(normalizedName);
  const encryptionKey = normalizedName + PASSWORD;
  
  const encryptedTags = encrypt(guest.tags, encryptionKey);
  secureData[nameHash] = encryptedTags;
});

const jsOutput = `const GUEST_DATA_SECURE = ${JSON.stringify(secureData, null, 2)};\n`;
fs.writeFileSync('media/guest_data.js', jsOutput);

console.log("Successfully encrypted guest data to media/guest_data.js");
