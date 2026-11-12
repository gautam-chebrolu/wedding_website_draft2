const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const program = require('../../media/ceremony_data');
const live = require('../../media/live_schedule_data');
const source = fs.readFileSync(require.resolve('../../assets/js/ceremony.js'), 'utf8');
function page(initial) {
  let now = Date.parse(initial), timer;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.textContent = ''; this.hidden = true; this.scrollLeft = 0; this.clientWidth = 320; this.offsetLeft = 0; this.scrollWidth = 5400; }
    appendChild(child) { child.offsetLeft = this.children.length * 356; this.children.push(child); return child; }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(key, fn) { this.handlers[key] = fn; }
    replaceChildren() { this.children = []; }
    querySelector(selector) { return this.children.find(child => child.className === selector.slice(1)); }
    scrollTo({ left }) { this.scrollLeft = left; }
  }
  const ids = Object.fromEntries(['ceremony-track', 'ceremony-status', 'ritual-prev', 'ritual-next', 'ritual-follow', 'ceremony-preview'].map(id => [id, new Element('div')]));
  const document = { getElementById: id => ids[id], createElement: tag => new Element(tag), addEventListener() {} };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { document, Date: Clock, Intl, URLSearchParams,
    window: { CEREMONY_PROGRAM: program, location: { search: '' }, matchMedia: () => ({ matches: true }), addEventListener() {} },
    setTimeout: (fn, delay) => { timer = { fn, delay }; }, clearTimeout() {} });
  return { ids, current: () => ids['ceremony-track'].children.find(c => c.attrs['aria-current'] === 'step')?.id,
    tick(time) { now = Date.parse(time); timer.fn(); }, timer: () => timer };
}
test('the sixteen moments match the wedding timeline and lunch follows the recessional', () => {
  assert.equal(program.items.length, 16);
  assert.deepEqual(live.wedding.blocks[0].items.slice(1, -1).map(i => [i.id, i.start, i.end]), program.items.map(i => [i.id, i.start, i.end]));
  assert.equal(live.wedding.blocks[0].items.at(-1).start, program.items.at(-1).end);
  const acts = live.sangeet.blocks[0].items.find(i => i.acts).acts;
  assert.equal(acts[acts.findIndex(a => /Nieces/.test(a.who)) + 1].who, 'Cary Academy Friends');
});
test('Eastern-time transitions include the one-minute rite, program gaps, and completion', () => {
  const p = page('2026-11-21T09:29:59-05:00');
  assert.equal(p.current(), undefined);
  p.tick('2026-11-21T09:30:00-05:00'); assert.equal(p.current(), 'ritual-baraat-welcome');
  p.tick('2026-11-21T09:55:00-05:00'); assert.equal(p.current(), undefined);
  p.tick('2026-11-21T10:00:00-05:00'); assert.equal(p.current(), 'ritual-ganesh-puja');
  p.tick('2026-11-21T10:52:00-05:00'); assert.equal(p.current(), 'ritual-jeelakarra-bellam');
  assert.ok(p.timer().delay <= 60010);
  p.tick('2026-11-21T10:53:00-05:00'); assert.equal(p.current(), 'ritual-mangalya-dharanam');
  p.tick('2026-11-21T12:05:00-05:00'); assert.equal(p.current(), undefined);
  assert.equal(p.ids['ceremony-status'].children[1].textContent, 'Ceremony complete');
});
test('automatic transitions respect browsing until follow is selected', () => {
  const p = page('2026-11-21T10:52:00-05:00');
  p.ids['ritual-prev'].handlers.click();
  const position = p.ids['ceremony-track'].scrollLeft;
  p.tick('2026-11-21T10:53:00-05:00');
  assert.equal(p.ids['ceremony-track'].scrollLeft, position);
  assert.equal(p.current(), 'ritual-mangalya-dharanam');
  p.ids['ritual-follow'].handlers.click();
  assert.notEqual(p.ids['ceremony-track'].scrollLeft, position);
});
