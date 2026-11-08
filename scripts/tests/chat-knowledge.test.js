const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { buildPublicKnowledge } = require('../export-chat-knowledge');

test('public export strips private event addresses and keeps valid public seed facts', () => {
  const data = buildPublicKnowledge();
  for (const event of data.events.filter(event => event.private)) {
    assert.deepEqual(Object.keys(event).sort(), ['date', 'name', 'private', 'time']);
  }
  assert.ok(data.facts.length > 0);
  assert.ok(data.facts.every(fact => fact.audience === 'public' && fact.published));
});

test('public export checksum is stable and schedule conflicts remain withheld', () => {
  const { version, ...payload } = buildPublicKnowledge();
  assert.equal(version, createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16));
  assert.equal(version, buildPublicKnowledge().version);
  for (const warning of payload.warnings) {
    const item = payload.schedule[warning.event].blocks.flatMap(block => block.items).find(item => item.id === warning.item);
    assert.equal(item.withheld, true);
  }
});
