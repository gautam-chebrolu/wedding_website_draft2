const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ceremony = require('../../media/ceremony_data');
const events = require('../../media/live_schedule_data');
const source = fs.readFileSync(require.resolve('../../assets/js/live.js'), 'utf8');

// Small DOM boundary for the shared renderer; native <details> supplies toggling.
function fixture(event, grouped) {
  let now = Date.parse('2026-11-21T09:20:00-05:00'), tick, override;
  const nodes = new Map();
  function node() {
    const classes = new Set();
    return { attrs: {}, style: {}, handlers: {}, textContent: '', open: false,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
      setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; },
      addEventListener(key, fn) { this.handlers[key] = fn; }, querySelectorAll() { return []; },
      scrollIntoView() { this.scrolled = true; } };
  }
  const timeline = node(), jump = node();
  let html = '';
  Object.defineProperty(timeline, 'innerHTML', { get: () => html, set(value) { html = value; nodes.clear(); } });
  function get(id) {
    if (!html.includes('id="' + id + '"')) return null;
    if (nodes.has(id)) return nodes.get(id);
    const value = node(); nodes.set(id, value);
    if (id.startsWith('group-')) {
      value.details = node(); value.status = node();
      value.querySelector = selector => selector === 'details' ? value.details : value.status;
    } else {
      value.dataset = { id: id.slice(5) }; value.chip = node(); value.card = node();
      value.querySelector = selector => selector === '.tl-chip' ? value.chip : selector === '.tl-card' ? value.card : null;
      value.closest = () => grouped && ceremony.items.some(i => i.id === value.dataset.id) ? get('group-wedding-ceremony').details : null;
    }
    return value;
  }
  timeline.querySelectorAll = selector => selector === '.tl-item'
    ? Array.from(html.matchAll(/id="(item-[^"]+)"/g), match => get(match[1])) : [];
  const document = { getElementById: get, addEventListener() {} };
  const WeddingData = { getDb: () => ({ collection: () => ({ doc: () => ({ onSnapshot: fn => { override = value => fn({ exists: true, data: () => value }); } }) }) }) };
  class Clock extends Date { static now() { return now; } }
  const window = { location: { search: '' }, WeddingData };
  vm.runInNewContext(source, { window, document, WeddingData, Date: Clock, Intl, URLSearchParams, console,
    setInterval: fn => { tick = fn; }, setTimeout() {} });
  window.Live.mountSchedule({ event, timeline, jump, expandable: true, continuous: true,
    group: grouped ? { id: 'wedding-ceremony', title: 'Wedding Ceremony', itemIds: ceremony.items.map(i => i.id) } : null });
  return { timeline, jump, get, override, advance(time) { now = Date.parse(time); tick(); } };
}

test('Wedding Day puts all rituals inside one collapsed ceremony card, leaving meals and reception outside', () => {
  const p = fixture(events.wedding, true), html = p.timeline.innerHTML;
  assert.equal((html.match(/<details class="tl-ceremony-group">/g) || []).length, 1);
  const inside = html.slice(html.indexOf('<details'), html.indexOf('</details>'));
  assert.match(inside, /Wedding Ceremony/);
  ceremony.items.forEach(item => assert.ok(inside.includes('id="item-' + item.id + '"')));
  assert.doesNotMatch(inside, /id="item-(baraat|lunch|cocktail|dinner)"/);
  assert.equal(p.get('group-wedding-ceremony').details.open, false);
});

test('the group follows the active ritual, respects manual collapsing, and reopens for Jump to now', () => {
  const p = fixture(events.wedding, true);
  p.advance('2026-11-21T10:52:00-05:00');
  const group = p.get('group-wedding-ceremony');
  assert.equal(group.details.open, true);
  assert.match(group.status.textContent, /Jeelakarra Bellam/);
  assert.equal(p.get('item-jeelakarra-bellam').attrs['aria-current'], 'step');
  group.details.open = false;
  p.advance('2026-11-21T10:52:10-05:00');
  assert.equal(group.details.open, false);
  p.jump.handlers.click(); assert.equal(group.details.open, true);
  p.advance('2026-11-21T10:53:00-05:00');
  assert.match(group.status.textContent, /Mangalya Dharanam/);
  assert.equal(p.get('item-jeelakarra-bellam').attrs['aria-current'], undefined);
});

test('delays still use individual ritual IDs and update the group time range', () => {
  const p = fixture(events.wedding, true);
  p.override({ delayMinutes: 10, delayFromId: 'ganesh-puja' });
  assert.match(p.timeline.innerHTML, /9:30.*12:15 PM/);
  p.advance('2026-11-21T10:10:00-05:00');
  assert.equal(p.get('item-ganesh-puja').attrs['aria-current'], 'step');
});

test('Sangeet still renders its performance lineup without a ceremony group', () => {
  const p = fixture(events.sangeet, false);
  assert.doesNotMatch(p.timeline.innerHTML, /<details class="tl-ceremony-group">/);
  assert.match(p.timeline.innerHTML, /Cary Academy Friends/);
});
