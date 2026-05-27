const fs = require('fs');
const csv = fs.readFileSync('media/wedding_guest_list.csv', 'utf8');
const js = `const GUEST_CSV_TEXT = \`${csv.replace(/`/g, '\\`')}\`;\n`;
fs.writeFileSync('media/guest_data.js', js);
console.log('Done');
