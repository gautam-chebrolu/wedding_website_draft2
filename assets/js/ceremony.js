(function () {
  'use strict';
  var program = window.CEREMONY_PROGRAM;
  var track = document.getElementById('ceremony-track');
  var status = document.getElementById('ceremony-status');
  var previous = document.getElementById('ritual-prev');
  var next = document.getElementById('ritual-next');
  var follow = document.getElementById('ritual-follow');
  var format = new Intl.DateTimeFormat('en-US', { timeZone: program.timeZone, hour: 'numeric', minute: '2-digit' });
  var items = program.items, cards = [], following = true, selected = 0, lastState = '', timer;
  var preview = new URLSearchParams(window.location.search).get('now');
  // Preview time always advances; a local-looking value is interpreted as EST.
  var previewTime = preview && Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(preview) ? preview + ':00-05:00' : preview);
  var offset = Number.isFinite(previewTime) ? previewTime - Date.now() : 0;
  if (Number.isFinite(previewTime)) {
    var notice = document.getElementById('ceremony-preview');
    notice.hidden = false;
    notice.textContent = 'Preview clock · ' + preview + ' · advances automatically';
  }
  function element(tag, text, className) {
    var el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  items.forEach(function (item, index) {
    var card = element('article', '', 'ritual-card');
    card.id = 'ritual-' + item.id;
    card.setAttribute('aria-labelledby', card.id + '-title');
    card.appendChild(element('div', 'Upcoming', 'ritual-state'));
    var time = element('time', format.format(Date.parse(item.start)) + ' – ' + format.format(Date.parse(item.end)), 'ritual-time');
    time.dateTime = item.start;
    time.appendChild(element('span', item.duration, 'ritual-duration'));
    card.appendChild(time);
    var title = element('h3', item.title); title.id = card.id + '-title'; card.appendChild(title);
    card.appendChild(element('p', item.description));
    var details = element('details');
    details.appendChild(element('summary', 'What does this mean?'));
    details.appendChild(element('p', item.meaning));
    var links = element('div', '', 'ritual-sources');
    item.sources.forEach(function (key) {
      var source = program.sources[key], link = element('a', source.title);
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.appendChild(link);
    });
    details.appendChild(links); card.appendChild(details); track.appendChild(card); cards.push(card);
  });
  function moveTo(index, smooth) {
    selected = Math.max(0, Math.min(items.length - 1, index));
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: cards[selected].offsetLeft - cards[0].offsetLeft, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    previous.disabled = selected === 0; next.disabled = selected === items.length - 1;
  }
  function browse(index) { following = false; moveTo(index, true); }
  previous.addEventListener('click', function () { browse(selected - 1); });
  next.addEventListener('click', function () { browse(selected + 1); });
  ['pointerdown', 'wheel', 'keydown'].forEach(function (event) {
    track.addEventListener(event, function () { following = false; }, { passive: true });
  });
  track.addEventListener('scroll', function () {
    var position = track.scrollLeft;
    selected = cards.reduce(function (best, card, index) {
      return Math.abs(card.offsetLeft - cards[0].offsetLeft - position) < Math.abs(cards[best].offsetLeft - cards[0].offsetLeft - position) ? index : best;
    }, 0);
    previous.disabled = position < 2;
    next.disabled = position >= track.scrollWidth - track.clientWidth - 2;
  }, { passive: true });
  function update(force) {
    clearTimeout(timer);
    var now = Date.now() + offset;
    var current = items.findIndex(function (item) { return now >= Date.parse(item.start) && now < Date.parse(item.end); });
    var upcoming = items.findIndex(function (item) { return now < Date.parse(item.start); });
    var target = current >= 0 ? current : upcoming >= 0 ? upcoming : items.length - 1;
    var state = current + ':' + upcoming;
    if (state !== lastState || force) {
      lastState = state;
      cards.forEach(function (card, index) {
        var active = index === current;
        if (active) card.setAttribute('aria-current', 'step'); else card.removeAttribute('aria-current');
        card.querySelector('.ritual-state').textContent = active ? 'Now · scheduled' : now >= Date.parse(items[index].end) ? 'Earlier' : 'Upcoming';
      });
      status.replaceChildren();
      status.appendChild(element('div', current >= 0 ? 'Now · scheduled program' : upcoming >= 0 ? 'Up next' : 'With love & blessings', 'ceremony-eyebrow'));
      status.appendChild(element('h2', current >= 0 ? items[current].title : upcoming >= 0 ? items[upcoming].title : 'Ceremony complete'));
      status.appendChild(element('p', current >= 0 ? items[current].description : upcoming >= 0 ? format.format(Date.parse(items[upcoming].start)) + ' Eastern · ' + items[upcoming].description : 'Thank you for celebrating with Priya & Gautam. Please join us for lunch.'));
      if (current >= 0 && upcoming >= 0) status.appendChild(element('p', 'Next: ' + items[upcoming].title + ' · ' + format.format(Date.parse(items[upcoming].start)) + ' Eastern', 'ceremony-note'));
      if (following) moveTo(target, !force);
    }
    // Schedule at the next exact boundary, with a minute heartbeat for clock changes.
    var boundaries = items.flatMap(function (item) { return [Date.parse(item.start), Date.parse(item.end)]; }).filter(function (time) { return time > now; });
    timer = setTimeout(update, Math.min(60000, boundaries.length ? Math.min.apply(null, boundaries) - now + 10 : 60000));
  }
  follow.addEventListener('click', function () { following = true; update(true); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) update(true); });
  window.addEventListener('resize', function () { if (following) update(true); });
  update(true);
})();
