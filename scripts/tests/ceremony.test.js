const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const program = require('../../media/ceremony_data');
const live = require('../../media/live_schedule_data');
const source = fs.readFileSync(require.resolve('../../assets/js/ceremony.js'), 'utf8');
function page(initial, search = '') {
  let now = Date.parse(initial), timer;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.textContent = ''; this.hidden = true; this.scrollLeft = 0; this.clientWidth = 320; this.offsetLeft = 0; this.scrollWidth = 5400; }
    appendChild(child) { child.offsetLeft = this.children.length * 356; this.children.push(child); return child; }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(key, fn) { this.handlers[key] = fn; }
    replaceChildren() { this.children = []; }
    querySelector(selector) {
      for (const child of this.children) {
        if ((child.className || '').split(' ').includes(selector.slice(1))) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
    scrollTo({ left, behavior }) { this.scrollLeft = left; this.scrollBehavior = behavior; }
    scrollIntoView() { this.scrolledIntoView = true; }
  }
  const ids = Object.fromEntries(['ceremony-track', 'ceremony-status', 'ritual-prev', 'ritual-next', 'ritual-follow', 'ceremony-preview',
    'ceremony-steps', 'ceremony-position', 'ceremony-progress', 'ceremony-countdown'].map(id => [id, new Element('div')]));
  const document = { handlers: {}, getElementById: id => ids[id], createElement: tag => new Element(tag),
    addEventListener(name, fn) { this.handlers[name] = fn; } };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { document, Date: Clock, Intl, URLSearchParams,
    window: { CEREMONY_PROGRAM: program, location: { search }, matchMedia: () => ({ matches: true }), addEventListener() {} },
    setTimeout: (fn, delay) => { timer = { fn, delay }; }, clearTimeout() {} });
  return { ids, current: () => ids['ceremony-track'].children.find(c => c.attrs['aria-current'] === 'step')?.id,
    tick(time) { now = Date.parse(time); timer.fn(); }, timer: () => timer,
    resume(time) { now = Date.parse(time); document.handlers.visibilitychange(); } };
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
  assert.equal(p.ids['ceremony-track'].scrolledIntoView, true);
});

test('every card shows the full ritual description and meaning without opening a disclosure', () => {
  const p = page('2026-11-21T09:00:00-05:00');
  const text = el => [el.textContent, ...el.children.map(text)].join(' ');
  program.items.forEach((item, index) => {
    const card = p.ids['ceremony-track'].children[index];
    assert.ok(text(card.querySelector('.ritual-body')).includes(item.description));
    assert.ok(text(card.querySelector('.ritual-body')).includes(item.meaning));
    assert.equal(p.ids['ceremony-steps'].children[index].attrs['aria-controls'], 'ritual-' + item.id);
  });
});

test('choosing a timeline moment pauses following while live status continues to advance', () => {
  const p = page('2026-11-21T10:52:00-05:00');
  p.ids['ceremony-steps'].children[9].handlers.click();
  const position = p.ids['ceremony-track'].scrollLeft;
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 10 of 16');
  assert.equal(p.ids['ritual-follow'].textContent, 'Return to live');
  p.tick('2026-11-21T10:53:00-05:00');
  assert.equal(p.current(), 'ritual-mangalya-dharanam');
  assert.equal(p.ids['ceremony-track'].scrollLeft, position);
  assert.equal(p.ids['ceremony-steps'].children[7].attrs['aria-current'], 'step');
  p.ids['ritual-follow'].handlers.click();
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 08 of 16');
  assert.equal(p.ids['ritual-follow'].attrs['aria-pressed'], 'true');
});

test('horizontal swiping pauses following; vertical reading does not', () => {
  const p = page('2026-11-21T10:52:00-05:00'), track = p.ids['ceremony-track'];
  track.handlers.pointerdown({ clientX: 100, clientY: 100 });
  track.handlers.pointermove({ clientX: 102, clientY: 170 });
  assert.equal(p.ids['ritual-follow'].attrs['aria-pressed'], 'true');
  track.handlers.pointermove({ clientX: 20, clientY: 105 });
  assert.equal(p.ids['ritual-follow'].attrs['aria-pressed'], 'false');
  track.scrollLeft = 356 * 9;
  track.handlers.scrollend();
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 10 of 16');
});

test('progress and accelerated previews follow the one-minute ritual precisely', () => {
  const p = page('2026-11-16T12:00:00-06:00', '?now=2026-11-21T10:52:00&speed=60');
  assert.equal(p.current(), 'ritual-jeelakarra-bellam');
  assert.equal(p.ids['ceremony-preview'].hidden, false);
  p.tick('2026-11-16T12:00:00.500-06:00');
  assert.equal(p.ids['ceremony-progress'].value, 50);
  assert.match(p.ids['ceremony-countdown'].textContent, /30 sec/);
  p.tick('2026-11-16T12:00:01-06:00');
  assert.equal(p.current(), 'ritual-mangalya-dharanam');
  assert.equal(p.ids['ceremony-progress'].value, 0);
  assert.ok(p.timer().delay <= 1000);
});

test('keyboard navigation is bounded and a returning tab immediately catches up', () => {
  const p = page('2026-11-21T09:00:00-05:00'), track = p.ids['ceremony-track'];
  track.handlers.keydown({ target: track, key: 'End', preventDefault() {} });
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 16 of 16');
  assert.equal(p.ids['ritual-next'].disabled, true);
  track.handlers.keydown({ target: track, key: 'Home', preventDefault() {} });
  assert.equal(p.ids['ritual-prev'].disabled, true);
  p.ids['ritual-follow'].handlers.click();
  p.resume('2026-11-21T11:26:00-05:00');
  assert.equal(p.current(), 'ritual-vivah-homam');
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 12 of 16');
});

test('the follow control can pause and resume, and focusing another card respects keyboard browsing', () => {
  const p = page('2026-11-21T10:52:00-05:00'), track = p.ids['ceremony-track'];
  p.ids['ritual-follow'].handlers.click();
  assert.equal(p.ids['ritual-follow'].attrs['aria-pressed'], 'false');
  p.tick('2026-11-21T10:53:00-05:00');
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 07 of 16');
  p.ids['ritual-follow'].handlers.click();
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 08 of 16');
  track.handlers.focusin({ target: { closest: () => track.children[12] } });
  assert.equal(p.ids['ceremony-position'].textContent, 'Moment 13 of 16');
  assert.equal(p.ids['ritual-follow'].attrs['aria-pressed'], 'false');
});
