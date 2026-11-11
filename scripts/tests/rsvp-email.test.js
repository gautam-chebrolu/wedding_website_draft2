const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// The configured Apps Script stays local because it contains private settings.
const source = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');
const timestamp = '2026-11-11T18:00:00.000Z';

function setup(extra = {}) {
  const sent = [];
  const context = vm.createContext({
    MailApp: { sendEmail: email => sent.push(email) },
    Logger: { log: message => assert.fail(message) },
    ...extra
  });
  vm.runInContext(source, context);
  return { context, sent };
}

function member(overrides = {}) {
  return {
    firstName: 'Test', lastName: 'Guest', email: 'new@example.test',
    phone: '(555) 111-2222', nutAllergy: 'No',
    dietaryRestrictions: 'Vegetarian', songRequests: 'September',
    rsvp: { Wedding: 'accepted', Reception: 'declined', Haldi: '' },
    ...overrides
  };
}

test('contact and dietary changes show new and previous values in both email formats', () => {
  const { context, sent } = setup();
  const current = member();
  const previous = member({ email: 'old@example.test', phone: '(555) 333-4444',
    nutAllergy: 'Yes', dietaryRestrictions: 'Gluten-free', songRequests: 'Dancing Queen' });
  context.sendConfirmationEmail({ party: 'Test Party', members: [current] }, timestamp, [previous]);
  assert.equal(sent.length, 1);
  const email = sent[0];
  assert.equal(email.to, current.email);
  assert.ok(email.bcc);
  for (const key of ['email', 'phone', 'nutAllergy', 'dietaryRestrictions', 'songRequests']) {
    assert.ok(email.htmlBody.includes(current[key]));
    assert.ok(email.htmlBody.includes('Previously: ' + previous[key]));
    assert.ok(email.body.includes(current[key]));
    assert.ok(email.body.includes('previously: ' + previous[key]));
  }
  assert.equal((email.htmlBody.match(/\(Updated\)/g) || []).length, 5);
  assert.match(email.body, /Wedding: Attending/);
  assert.match(email.body, /Reception: Not Attending/);
  assert.match(email.body, /Haldi: No Response/);
  assert.ok(email.body.includes(timestamp));
});

test('cleared fields remain visible and unchanged fields are not marked updated', () => {
  const { context, sent } = setup();
  context.sendConfirmationEmail({ members: [member({ dietaryRestrictions: '', songRequests: '' })] },
    timestamp, [member()]);
  assert.match(sent[0].body, /Dietary Restrictions: Not provided \(Updated; previously: Vegetarian\)/);
  assert.match(sent[0].body, /Song Requests: Not provided \(Updated; previously: September\)/);
  assert.equal((sent[0].htmlBody.match(/\(Updated\)/g) || []).length, 2);
  assert.match(sent[0].body, /Phone Number: \(555\) 111-2222\n/);
});

test('guest-entered values and previous values are escaped in HTML', () => {
  const { context, sent } = setup();
  const unsafe = '<img src=x onerror="bad()"> & \'quoted\'';
  context.sendConfirmationEmail({ displayName: unsafe,
    members: [member({ firstName: unsafe, dietaryRestrictions: unsafe })] },
  timestamp, [member({ dietaryRestrictions: '<script>bad()</script>' })]);
  assert.ok(!sent[0].htmlBody.includes('<img'));
  assert.ok(!sent[0].htmlBody.includes('<script>'));
  assert.ok(sent[0].htmlBody.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; &#39;quoted&#39;'));
  assert.ok(sent[0].body.includes(unsafe));
});

test('without a prior snapshot all fields are included without invented changes', () => {
  const { context, sent } = setup();
  context.sendConfirmationEmail({ members: [member()] }, timestamp);
  assert.match(sent[0].body, /Email Address: new@example.test/);
  assert.match(sent[0].body, /Phone Number: \(555\) 111-2222/);
  assert.ok(!sent[0].htmlBody.includes('(Updated)'));
});

test('omitted fields preserve the previous saved detail and no email still notifies the couple', () => {
  const { context, sent } = setup();
  const current = member({ email: '', phone: undefined, dietaryRestrictions: undefined });
  context.sendConfirmationEmail({ party: 'Test Party', members: [current] }, timestamp, [member()]);
  assert.ok(sent[0].to);
  assert.equal(sent[0].bcc, undefined);
  assert.equal(sent[0].subject, '[RSVP Received] Test Party');
  assert.match(sent[0].body, /Email Address: Not provided \(Updated/);
  assert.match(sent[0].body, /Phone Number: \(555\) 111-2222\n/);
  assert.match(sent[0].body, /Dietary Restrictions: Vegetarian\n/);
});

test('party submissions keep each member details separate and deduplicate recipients', () => {
  const { context, sent } = setup();
  const first = member();
  const second = member({ firstName: 'Other', dietaryRestrictions: 'Vegan' });
  context.sendConfirmationEmail({ members: [first, second] }, timestamp,
    [first, member({ firstName: 'Other', dietaryRestrictions: 'Gluten-free' })]);
  assert.equal(sent[0].to, first.email);
  const [firstSection, secondSection] = sent[0].body.split('Other Guest');
  assert.ok(!firstSection.includes('(Updated'));
  assert.match(secondSection, /Dietary Restrictions: Vegan \(Updated; previously: Gluten-free\)/);
});

test('submission snapshots the Sheet before updating it and uses that snapshot in the email', () => {
  const rows = [
    ['First Name', 'Last Name', 'Tags', 'Email Address', 'Phone Number', 'Nut Allergy',
      'Dietary Restrictions', 'Song Requests', 'Wedding', 'RSVP Status', 'RSVP Timestamp'],
    ['Test', 'Guest', 'Wedding', 'old@example.test', '(555) 333-4444', 'Yes',
      'Gluten-free', 'Dancing Queen', 'accepted', 'submitted', 'old timestamp']
  ];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map(row => row.slice()) }),
    getRange: (row, column) => ({ setValue: value => { rows[row - 1][column - 1] = value; } })
  };
  const { context, sent } = setup({ SpreadsheetApp: {
    openById: () => ({ getSheetByName: () => sheet })
  } });
  const password = vm.runInContext('CONFIG.PASSWORD', context);
  const result = context.handleSubmit({ pwd: password, members: [member({ dietaryRestrictions: '' })] });
  assert.equal(result.success, true);
  assert.equal(rows[1][3], 'new@example.test');
  assert.equal(rows[1][6], '');
  assert.equal(rows[1][8], 'accepted');
  assert.match(sent[0].body, /Email Address: new@example.test \(Updated; previously: old@example.test\)/);
  assert.match(sent[0].body, /Dietary Restrictions: Not provided \(Updated; previously: Gluten-free\)/);
});
