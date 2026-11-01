const fs = require('fs');
const firestore = require('./firestore_rest');

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

(async () => {
  const token = await firestore.getAccessToken(firestore.loadServiceAccount());
  const guests = await firestore.firestoreGet(token, 'guests');
  const rows = guests
    .filter(({ data }) => (data.events || []).includes('Atlanta Reception'))
    .map(({ data }) => {
      const rsvp = (data.rsvp || {})['Atlanta Reception'];
      return {
        name: data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        response: rsvp === 'accepted' ? 'accepted' : rsvp === 'declined' ? 'declined' : 'no response',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(
    'balaji_kalyanam_rsvps.csv',
    '\uFEFF' + [['Name', 'Response'], ...rows.map(row => [row.name, row.response])]
      .map(row => row.map(csvCell).join(','))
      .join('\r\n'),
    'utf8',
  );
  console.log(`Exported ${rows.length} invited guests to balaji_kalyanam_rsvps.csv`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
