(function () {
  'use strict';
  var program = window.CEREMONY_PROGRAM;
  var track = document.getElementById('ceremony-track');
  if (!program || !track) return;
  var status = document.getElementById('ceremony-status');
  var previous = document.getElementById('ritual-prev');
  var next = document.getElementById('ritual-next');
  var follow = document.getElementById('ritual-follow');
  var stepRail = document.getElementById('ceremony-steps');
  var position = document.getElementById('ceremony-position');
  var progress = document.getElementById('ceremony-progress');
  var countdown = document.getElementById('ceremony-countdown');
  var format = new Intl.DateTimeFormat('en-US', { timeZone: program.timeZone, hour: 'numeric', minute: '2-digit' });
  var items = program.items, cards = [], steps = [];
  var following = true, selected = 0, lastState = '', timer, scrollTimer, pointer;
  var current = -1, upcoming = 0;
  var params = new URLSearchParams(window.location.search);
  var raw = params.get('now'), previewTime = NaN;
  if (raw) {
    var date = raw.trim().replace(' ', 'T');
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(date)) date += ':00';
    if (!/(Z|[+-]\d\d:\d\d)$/i.test(date)) date += '-05:00';
    previewTime = Date.parse(date);
  }
  var simulated = Number.isFinite(previewTime), realStart = Date.now();
  var speed = simulated ? Math.max(.1, Math.min(3600, parseFloat(params.get('speed')) || 1)) : 1;
  if (simulated) {
    var notice = document.getElementById('ceremony-preview');
    notice.hidden = false;
    notice.textContent = 'Preview clock · ' + raw + ' · display times are Eastern · ' + (speed === 1 ? 'advances in real time' : speed + '× speed');
  }
  function now() { return simulated ? previewTime + (Date.now() - realStart) * speed : Date.now(); }
  function number(index) { return String(index + 1).padStart(2, '0'); }
  function range(item) { return format.format(Date.parse(item.start)) + ' – ' + format.format(Date.parse(item.end)); }
  function element(tag, text, className) {
    var el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function duration(ms) {
    var seconds = Math.max(0, Math.ceil(ms / 1000));
    if (seconds < 60) return seconds + ' sec';
    var minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
    if (days) return days + 'd ' + (hours % 24) + 'h';
    if (hours) return hours + 'h ' + (minutes % 60) + 'm';
    return minutes + ' min' + (seconds % 60 ? ' ' + (seconds % 60) + ' sec' : '');
  }
  items.forEach(function (item, index) {
    var card = element('article', '', 'ritual-card');
    card.id = 'ritual-' + item.id;
    card.setAttribute('aria-labelledby', card.id + '-title');
    var topline = element('div', '', 'ritual-topline');
    topline.appendChild(element('span', 'Moment ' + number(index) + ' / ' + items.length, 'ritual-number'));
    topline.appendChild(element('span', 'Upcoming', 'ritual-state'));
    card.appendChild(topline);
    var time = element('time', range(item), 'ritual-time');
    time.dateTime = item.start;
    time.appendChild(element('span', ' · ' + item.duration, 'ritual-duration'));
    card.appendChild(time);
    var title = element('h3', item.title); title.id = card.id + '-title'; card.appendChild(title);
    var body = element('div', '', 'ritual-body');
    var scene = element('div', '', 'ritual-section');
    scene.appendChild(element('h4', 'What you’ll see', 'ritual-section-title'));
    scene.appendChild(element('p', item.description));
    var meaning = element('div', '', 'ritual-section ritual-meaning');
    meaning.appendChild(element('h4', 'The meaning', 'ritual-section-title'));
    meaning.appendChild(element('p', item.meaning));
    body.appendChild(scene); body.appendChild(meaning); card.appendChild(body);
    if (item.sources.length) {
      var references = element('details', '', 'ritual-references');
      references.appendChild(element('summary', 'Explore the traditions'));
      var links = element('div', '', 'ritual-sources');
      item.sources.forEach(function (key) {
        var source = program.sources[key], link = element('a', source.title);
        link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.appendChild(link);
      });
      references.appendChild(links); card.appendChild(references);
    } else card.appendChild(element('p', 'From Priya & Gautam’s ceremony program', 'ritual-provenance'));
    track.appendChild(card); cards.push(card);

    var step = element('button', '', 'ceremony-step');
    step.type = 'button';
    step.setAttribute('aria-controls', card.id);
    step.setAttribute('aria-label', format.format(Date.parse(item.start)) + ' Eastern: ' + item.title);
    step.appendChild(element('span', number(index) + ' · ' + format.format(Date.parse(item.start)), 'ceremony-step-meta'));
    step.appendChild(element('span', item.title, 'ceremony-step-title'));
    step.addEventListener('click', function () { browse(index); });
    stepRail.appendChild(step); steps.push(step);
  });
  function syncSelection(reveal) {
    position.textContent = 'Moment ' + number(selected) + ' of ' + items.length;
    steps.forEach(function (step, index) { step.setAttribute('aria-pressed', index === selected ? 'true' : 'false'); });
    previous.disabled = selected === 0;
    next.disabled = selected === items.length - 1;
    if (reveal) stepRail.scrollTo({ left: steps[selected].offsetLeft - steps[0].offsetLeft, behavior: 'auto' });
  }
  function syncFollow() {
    follow.setAttribute('aria-pressed', following ? 'true' : 'false');
    follow.setAttribute('aria-label', following ? 'Pause automatic following' : 'Return to the current scheduled moment');
    follow.textContent = following ? (current >= 0 ? 'Following live' : 'Following program') : (current >= 0 ? 'Return to live' : 'Follow program');
  }
  function pauseFollowing() { following = false; syncFollow(); }
  function moveTo(index, smooth) {
    selected = Math.max(0, Math.min(items.length - 1, index));
    track.scrollTo({ left: cards[selected].offsetLeft - cards[0].offsetLeft, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    syncSelection(true);
  }
  function browse(index) { pauseFollowing(); moveTo(index, true); }
  previous.addEventListener('click', function () { browse(selected - 1); });
  next.addEventListener('click', function () { browse(selected + 1); });
  track.addEventListener('pointerdown', function (event) { pointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
  track.addEventListener('pointermove', function (event) {
    if (!pointer) return;
    var dx = Math.abs(event.clientX - pointer.x), dy = Math.abs(event.clientY - pointer.y);
    if (dx > 8 && dx > dy) pauseFollowing();
  }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
    track.addEventListener(name, function () { pointer = null; }, { passive: true });
  });
  track.addEventListener('wheel', function (event) {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) pauseFollowing();
  }, { passive: true });
  track.addEventListener('keydown', function (event) {
    if (event.target !== track) return;
    var target = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: items.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); browse(target); }
  });
  track.addEventListener('focusin', function (event) {
    var card = event.target.closest('.ritual-card'), index = cards.indexOf(card);
    if (index >= 0 && index !== selected) { pauseFollowing(); selected = index; syncSelection(true); }
  });
  function settleScroll() {
    clearTimeout(scrollTimer);
    if (following) return;
    selected = cards.reduce(function (best, card, index) {
      return Math.abs(card.offsetLeft - cards[0].offsetLeft - track.scrollLeft) <
        Math.abs(cards[best].offsetLeft - cards[0].offsetLeft - track.scrollLeft) ? index : best;
    }, 0);
    syncSelection(true);
  }
  track.addEventListener('scroll', function () { clearTimeout(scrollTimer); scrollTimer = setTimeout(settleScroll, 140); }, { passive: true });
  track.addEventListener('scrollend', settleScroll);

  function update(force) {
    clearTimeout(timer);
    var time = now();
    current = items.findIndex(function (item) { return time >= Date.parse(item.start) && time < Date.parse(item.end); });
    upcoming = items.findIndex(function (item) { return time < Date.parse(item.start); });
    var target = current >= 0 ? current : upcoming >= 0 ? upcoming : items.length - 1;
    var state = current + ':' + upcoming;
    if (state !== lastState || force) {
      lastState = state;
      cards.forEach(function (card, index) {
        var active = index === current, past = time >= Date.parse(items[index].end);
        [card, steps[index]].forEach(function (el) {
          if (active) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
        });
        steps[index].setAttribute('data-past', past ? 'true' : 'false');
        card.querySelector('.ritual-state').textContent = active ? 'Now · scheduled' : past ? 'Earlier' : 'Upcoming';
      });
      status.replaceChildren();
      var label = current >= 0 ? 'Now · moment ' + number(current) + ' of ' + items.length : upcoming >= 0 ? 'Up next' : 'With love & blessings';
      status.appendChild(element('div', label, 'ceremony-eyebrow'));
      status.appendChild(element('h2', current >= 0 ? items[current].title : upcoming >= 0 ? items[upcoming].title : 'Ceremony complete'));
      status.appendChild(element('p', current >= 0 ? range(items[current]) + ' Eastern · ' + items[current].duration : upcoming >= 0 ?
        format.format(Date.parse(items[upcoming].start)) + ' Eastern · Saturday, November 21' :
        'Thank you for celebrating with us. Please join us for lunch.', 'ceremony-live-time'));
      if (current >= 0 && upcoming >= 0) status.appendChild(element('p', 'Next · ' + items[upcoming].title + ' · ' + format.format(Date.parse(items[upcoming].start)), 'ceremony-live-next'));
      if (following) moveTo(target, !force);
    }
    syncFollow();
    if (current >= 0) {
      var start = Date.parse(items[current].start), end = Date.parse(items[current].end);
      progress.value = Math.max(0, Math.min(100, (time - start) / (end - start) * 100));
      countdown.textContent = 'This moment · ' + duration(end - time) + ' remaining in the planned program';
    } else {
      progress.value = upcoming >= 0 ? 0 : 100;
      countdown.textContent = upcoming >= 0 ? (time < Date.parse(items[0].start) ? 'Our ceremony begins in ' : 'Next moment in ') +
        duration(Date.parse(items[upcoming].start) - time) : 'A new chapter begins.';
    }
    var boundaries = items.flatMap(function (item) { return [Date.parse(item.start), Date.parse(item.end)]; }).filter(function (boundary) { return boundary > time; });
    timer = setTimeout(update, Math.max(16, Math.min(1000, boundaries.length ? (Math.min.apply(null, boundaries) - time) / speed + 10 : 1000)));
  }
  follow.addEventListener('click', function () {
    if (following) { pauseFollowing(); return; }
    following = true; update(true);
    track.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) update(true); });
  window.addEventListener('resize', function () { if (following) update(true); });
  update(true);
})();
