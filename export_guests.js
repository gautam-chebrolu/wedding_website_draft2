const fs = require('fs');
const firestore = require('./firestore_rest');

function csvCell(value) {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const RSVP_EVENTS = [
  'Ganesh Puja',
  'Haldi',
  'Sangeet',
  'Wedding',
  'Reception',
  'Satyanarayana Puja',
  'Atlanta Reception',
];

function rsvpColumn(event) {
  return 'rsvp' + event.replace(/[^a-zA-Z0-9]/g, '');
}

(async () => {
  const token = await firestore.getAccessToken(firestore.loadServiceAccount());
  const guests = await firestore.firestoreGet(token, 'guests');
  const fields = [...new Set(guests.flatMap(guest => Object.keys(guest.data)))]
    .filter(field => field !== 'rsvp')
    .sort();
  const rsvpFields = RSVP_EVENTS.map(rsvpColumn);
  const rows = [
    ['documentId', ...fields, ...rsvpFields],
    ...guests.map(guest => [
      guest.id,
      ...fields.map(field => guest.data[field]),
      ...RSVP_EVENTS.map(event => (guest.data.rsvp || {})[event] || ''),
    ]),
  ];

  fs.writeFileSync(
    'guests_export.csv',
    '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'),
    'utf8',
  );
  console.log(`Exported ${guests.length} guests with ${rsvpFields.length} RSVP columns to guests_export.csv`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
