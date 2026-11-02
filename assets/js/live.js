/* ============================================================
   WEDDING WEBSITE — live.js
   Live-updating schedule engine for /sangeet and /wedding.

   Exposes window.Live with:
     Live.mountSchedule(opts)  – hero + countdown + timeline
     Live.mountStations(opts)  – "Now Showing" food-station posters
     Live.mountSeating(opts)   – reception seating-chart search

   Testing: add ?now=2026-11-20T19:40 to the URL to preview the page
   at that Eastern time (add &speed=60 to fast-forward 1 min/sec).

   Load after: Firebase compat SDKs, firestore_data.js,
               media/live_schedule_data.js
   ============================================================ */

(function (global) {
  'use strict';

  var TZ = 'America/New_York';
  var MIN = 60000;

  // ── Formatting helpers ──────────────────────────────────────
  var fmtTime = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  var fmtTimeShort = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

  function timeLabel(ms) { return fmtTime.format(new Date(ms)); }

  /** "5:45 – 10:00 PM" (drops the repeated meridiem when both match). */
  function rangeLabel(a, b) {
    var x = fmtTimeShort.format(new Date(a)), y = fmtTimeShort.format(new Date(b));
    var mx = x.slice(-2), my = y.slice(-2);
    return (mx === my ? x.slice(0, -3) : x) + ' – ' + y;
  }

  /** Compact relative duration: "45s", "12 min", "2h 15m", "3d 4h". */
  function fmtIn(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 60) return s + 's';
    var m = Math.ceil(s / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return h + 'h' + (r ? ' ' + r + 'm' : '');
    var d = Math.floor(h / 24);
    return d + 'd' + (h % 24 ? ' ' + (h % 24) + 'h' : '');
  }

  function parts(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Clock (supports ?now= preview mode) ─────────────────────
  var Clock = (function () {
    var params = new URLSearchParams(global.location.search);
    var raw = params.get('now');
    var speed = parseFloat(params.get('speed')) || 1;
    var base = null;
    var realStart = Date.now();
    if (raw) {
      var s = raw.trim().replace(' ', 'T');
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
      if (!/(Z|[+-]\d{2}:\d{2})$/i.test(s)) s += '-05:00';
      var t = Date.parse(s);
      if (!isNaN(t)) base = t;
    }
    return {
      simulated: base !== null,
      now: function () {
        return base === null ? Date.now() : base + (Date.now() - realStart) * speed;
      }
    };
  })();

  // One shared 1-second ticker for every module on the page.
  var tickers = [];
  function onTick(fn) { tickers.push(fn); fn(Clock.now()); }
  setInterval(function () {
    var now = Clock.now();
    for (var i = 0; i < tickers.length; i++) {
      try { tickers[i](now); } catch (e) { console.error(e); }
    }
  }, 1000);

  // Preview-mode badge so nobody mistakes a ?now= link for reality.
  if (Clock.simulated) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.className = 'preview-badge';
      document.body.appendChild(b);
      onTick(function (now) { b.textContent = 'Preview · ' + timeLabel(now); });
    });
  }

  // ── Firestore live override (live/{eventKey}) ───────────────
  function subscribeOverride(key, cb) {
    try {
      if (!global.WeddingData || !WeddingData.getDb) return;
      WeddingData.getDb().collection('live').doc(key).onSnapshot(function (snap) {
        cb(snap.exists ? (snap.data() || {}) : {});
      }, function (err) {
        console.warn('Live override unavailable:', err && err.message);
      });
    } catch (e) {
      console.warn('Live override unavailable:', e && e.message);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SCHEDULE
  // ════════════════════════════════════════════════════════════

  /** Flatten blocks → items with effective (delay-shifted) times. */
  function buildModel(event, ov) {
    var flat = [];
    event.blocks.forEach(function (block, bi) {
      block.items.forEach(function (it) {
        flat.push({ raw: it, id: it.id, block: bi });
      });
    });

    var delayMs = Math.max(0, parseInt(ov.delayMinutes, 10) || 0) * MIN;
    var delayIdx = -1;
    if (delayMs) {
      delayIdx = ov.delayFromId ? flat.findIndex(function (x) { return x.id === ov.delayFromId; }) : -1;
      if (delayIdx < 0) delayMs = 0;
    }

    flat.forEach(function (x, i) {
      x.shift = delayMs && i >= delayIdx ? delayMs : 0;
      x.origStart = Date.parse(x.raw.start);
      x.start = x.origStart + x.shift;
      x.end = x.raw.end ? Date.parse(x.raw.end) + x.shift : null;
    });

    flat.forEach(function (x, i) {
      if (x.end) x.liveEnd = x.end;
      else if (x.raw.liveUntil) x.liveEnd = Date.parse(x.raw.liveUntil) + x.shift;
      else x.liveEnd = flat[i + 1] ? flat[i + 1].start : x.start + 60 * MIN;
      x.openEnded = !x.end && !!x.raw.liveUntil;
    });

    return { flat: flat, delayMinutes: delayMs / MIN };
  }

  function stateAt(model, now) {
    var live = [], next = null;
    model.flat.forEach(function (x) {
      x.state = now >= x.liveEnd ? 'past' : (now >= x.start ? 'live' : 'upcoming');
      if (x.state === 'live') live.push(x);
      if (x.state === 'upcoming' && !next) next = x;
    });
    var first = model.flat[0];
    var phase = live.length ? 'live' : (now < first.start ? 'pre' : (next ? 'gap' : 'post'));
    return { live: live, current: live[live.length - 1] || null, next: next, phase: phase };
  }

  function displayTime(x) {
    if (x.raw.time && !x.shift) return x.raw.time;
    return x.end ? rangeLabel(x.start, x.end) : timeLabel(x.start);
  }

  function mountSchedule(opts) {
    var event = opts.event;
    var heroEl = opts.hero, tlEl = opts.timeline, bannerEl = opts.banner;
    var tabsEl = opts.tabs, jumpEl = opts.jump;
    var expandable = !!opts.expandable;
    var continuous = !!opts.continuous;

    var ov = {};
    var model = buildModel(event, ov);
    var activeBlock = null;      // index of the tab being shown
    var userPickedTab = false;
    var lastSig = '';
    var heroSig = '';
    var didAutoScroll = false;
    var currentLiveId = null;

    // ── Tabs ──
    function renderTabs() {
      if (!tabsEl) return;
      if (event.blocks.length < 2) { tabsEl.hidden = true; return; }
      tabsEl.innerHTML = event.blocks.map(function (b, i) {
        return '<button type="button" role="tab" class="live-tab" id="tab-' + esc(b.id) + '" data-block="' + i +
          '" aria-selected="false"><span class="live-tab-dot" aria-hidden="true"></span>' + esc(b.label) + '</button>';
      }).join('');
      tabsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.live-tab');
        if (!btn) return;
        userPickedTab = true;
        setBlock(+btn.dataset.block);
      });
    }

    function setBlock(i) {
      activeBlock = i;
      if (tabsEl) {
        tabsEl.querySelectorAll('.live-tab').forEach(function (b) {
          var on = +b.dataset.block === i;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
      tlEl.querySelectorAll('.tl-block').forEach(function (sec) {
        sec.hidden = !continuous && event.blocks.length > 1 && +sec.dataset.block !== i;
      });
    }

    // ── Timeline DOM (rebuilt only when the override changes times) ──
    function renderTimeline() {
      tlEl.innerHTML = event.blocks.map(function (block, bi) {
        var items = model.flat.filter(function (x) { return x.block === bi; });
        return '<section class="tl-block" data-block="' + bi + '" aria-label="' + esc(block.label) + '">' +
          (event.blocks.length > 1 ? '<h2 class="tl-block-title">' + esc(block.label) + '</h2>' : '') +
          '<ol class="tl-list">' + items.map(itemHTML).join('') + '</ol></section>';
      }).join('');
      setBlock(activeBlock == null ? 0 : activeBlock);
      lastSig = '';
    }

    function itemHTML(x) {
      var it = x.raw;
      var details = (it.details || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
      var acts = '';
      if (it.acts && it.acts.length) {
        acts = '<ol class="tl-acts">' + it.acts.map(function (a, i) {
          return '<li class="tl-act" data-act="' + i + '"><span class="tl-act-num">' + (i + 1) + '</span>' +
            '<span class="tl-act-text"><b>' + esc(a.who) + '</b>' + (a.name ? '<span>' + esc(a.name) + '</span>' : '') + '</span>' +
            '<span class="tl-act-tag" aria-hidden="true"></span></li>';
        }).join('') + '</ol>';
      }
      var was = x.shift ? '<s class="tl-was">' + esc(it.time || timeLabel(x.origStart)) + '</s>' : '';
      return '<li class="tl-item is-upcoming" id="item-' + esc(x.id) + '" data-id="' + esc(x.id) + '">' +
        '<div class="tl-time">' + was + '<span>' + esc(displayTime(x)) + '</span></div>' +
        '<div class="tl-rail" aria-hidden="true"><span class="tl-dot"></span></div>' +
        '<article class="tl-card" tabindex="0">' +
          '<div class="tl-card-head"><div><h3 class="tl-title">' + esc(it.title) + '</h3>' +
          '<span class="tl-card-time">' + esc(displayTime(x)) + '</span></div>' +
          '<span class="tl-chip"></span></div>' +
          '<div class="tl-body">' +
            (x.shift ? '<p class="tl-delay">Running about ' + (x.shift / MIN) + ' min behind</p>' : '') +
            (details ? '<ul class="tl-details">' + details + '</ul>' : '') + acts +
          '</div>' +
          (x.openEnded ? '' : '<div class="tl-progress" aria-hidden="true"><span></span></div>') +
        '</article></li>';
    }

    var manualOpenId = null;

    function syncOpenCards(liveItem) {
      tlEl.querySelectorAll('.tl-item').forEach(function (li) {
        var open = expandable
          ? (!!liveItem ? li.dataset.id === liveItem.id : li.dataset.id === manualOpenId)
          : (li.classList.contains('is-past') && li.classList.contains('is-open'));
        li.classList.toggle('is-open', open);
        var card = li.querySelector('.tl-card');
        if (card) card.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    // Compact live pages expand any card; legacy pages keep past-item toggling.
    tlEl.addEventListener('click', function (e) {
      var card = e.target.closest('.tl-card');
      if (!card) return;
      var li = card.parentElement;
      if (expandable) {
        if (currentLiveId) return;
        manualOpenId = li.classList.contains('is-open') ? null : li.dataset.id;
        syncOpenCards(null);
        if (manualOpenId) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (li.classList.contains('is-past')) {
        li.classList.toggle('is-open');
      }
    });
    tlEl.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tl-card')) {
        e.preventDefault(); e.target.click();
      }
    });

    // ── Banner (manual message + automatic delay notice) ──
    function renderBanner() {
      if (!bannerEl) return;
      var msgs = [];
      if (ov.banner && String(ov.banner).trim()) msgs.push({ cls: 'is-note', text: String(ov.banner).trim() });
      if (model.delayMinutes) {
        msgs.push({ cls: 'is-delay', text: 'We’re running about ' + model.delayMinutes + ' minutes behind — the times below are updated.' });
      }
      bannerEl.innerHTML = msgs.map(function (m) {
        return '<div class="live-banner ' + m.cls + '" role="status"><span class="live-banner-icon" aria-hidden="true"></span><p>' + esc(m.text) + '</p></div>';
      }).join('');
      bannerEl.hidden = !msgs.length;
    }

    // ── Hero ──
    function countdownHTML(withDays) {
      var units = withDays ? ['d', 'h', 'm', 's'] : ['h', 'm', 's'];
      var names = { d: 'Days', h: 'Hours', m: 'Minutes', s: 'Seconds' };
      return '<div class="countdown" role="timer">' + units.map(function (u) {
        return '<div class="cd-unit"><b data-cd="' + u + '">00</b><span>' + names[u] + '</span></div>';
      }).join('<i class="cd-sep" aria-hidden="true">:</i>') + '</div>';
    }

    function renderHero(st, now) {
      if (!heroEl) return;
      var cur = st.current, next = st.next;
      var act = currentActInfo(st);
      var sig = st.phase + '|' + (cur && cur.id) + '|' + (next && next.id) + '|' + (act ? act.idx : '');
      if (st.phase === 'pre') sig += '|' + (next.start - now > 86400000 ? 'd' : 'h');
      if (sig !== heroSig) {
        heroSig = sig;
        var html = '';
        if (st.phase === 'pre') {
          html = '<p class="hero-kicker">' + esc(event.name) + ' begins in</p>' +
            countdownHTML(next.start - now > 86400000) +
            '<p class="hero-when">' + esc(event.date) + ' · ' + esc(timeLabel(next.start)) + '</p>';
        } else if (st.phase === 'live') {
          html = '<span class="live-pill"><i aria-hidden="true"></i>Live now</span>' +
            '<h2 class="hero-live-title">' + esc(cur.raw.title) + '</h2>' +
            (act ? '<p class="hero-live-sub">Now performing · <b>' + esc(act.text) + '</b>' +
              (act.nextText ? '<br><span>Up next · ' + esc(act.nextText) + '</span>' : '') + '</p>'
              : (cur.raw.details && cur.raw.details[0] ? '<p class="hero-live-sub">' + esc(cur.raw.details[0]) + '</p>' : '')) +
            (next ? '<button type="button" class="hero-next" data-goto="' + esc(next.id) + '">Up next · <b>' + esc(next.raw.title) +
              '</b><span class="hero-next-in" data-next-in></span></button>' : '');
        } else if (st.phase === 'gap') {
          html = '<p class="hero-kicker">Up next</p><h2 class="hero-live-title">' + esc(next.raw.title) + '</h2>' +
            countdownHTML(false) + '<p class="hero-when">' + esc(timeLabel(next.start)) + '</p>';
        } else {
          html = '<p class="hero-kicker">That’s a wrap</p><h2 class="hero-live-title">Thank you for celebrating with us!</h2>';
        }
        heroEl.innerHTML = html;
        heroEl.dataset.phase = st.phase;
      }
      // Per-second values
      if (next) {
        var p = parts(next.start - now);
        heroEl.querySelectorAll('[data-cd]').forEach(function (el) {
          var u = el.dataset.cd;
          var v = u === 'h' && !heroEl.querySelector('[data-cd="d"]') ? p.h + p.d * 24 : p[u];
          var txt = pad(v);
          if (el.textContent !== txt) {
            el.textContent = txt;
            el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
          }
        });
        var ni = heroEl.querySelector('[data-next-in]');
        if (ni) ni.textContent = 'in ' + fmtIn(next.start - now);
      }
    }

    if (heroEl) {
      heroEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-goto]');
        if (b) scrollToItem(b.dataset.goto);
      });
    }

    function currentActInfo(st) {
      var cur = st.current;
      if (!cur || !cur.raw.acts) return null;
      var idx = ov.currentAct;
      if (typeof idx !== 'number' || idx < 0 || idx >= cur.raw.acts.length) return null;
      var a = cur.raw.acts[idx], n = cur.raw.acts[idx + 1];
      var label = function (x) { return x.who + (x.name ? ' — ' + x.name : ''); };
      return { idx: idx, text: label(a), nextText: n ? label(n) : '' };
    }

    // ── Per-tick update ──
    function update(now) {
      var st = stateAt(model, now);
      currentLiveId = st.current ? st.current.id : null;

      // Auto-pick the tab that holds what's live / next.
      var focus = st.current || st.next || model.flat[model.flat.length - 1];
      if (!userPickedTab && focus && focus.block !== activeBlock) setBlock(focus.block);
      if (tabsEl) {
        tabsEl.querySelectorAll('.live-tab').forEach(function (b) {
          b.classList.toggle('has-live', !!st.current && st.current.block === +b.dataset.block);
        });
      }

      var actIdx = typeof ov.currentAct === 'number' ? ov.currentAct : -1;
      var sig = model.flat.map(function (x) { return x.state; }).join(',') + '|' + (st.next && st.next.id) + '|' + actIdx;
      if (sig !== lastSig) {
        lastSig = sig;
        model.flat.forEach(function (x) {
          var li = document.getElementById('item-' + x.id);
          if (!li) return;
          li.classList.remove('is-past', 'is-live', 'is-upcoming', 'is-next');
          li.classList.add('is-' + x.state);
          if (st.next === x) li.classList.add('is-next');
          var chip = li.querySelector('.tl-chip');
          chip.className = 'tl-chip';
          if (x.state === 'live') { chip.classList.add('chip-live'); chip.innerHTML = '<i aria-hidden="true"></i>Live'; }
          else if (x.state === 'past') { chip.classList.add('chip-past'); chip.textContent = 'Done'; }
          else chip.textContent = '';
          // Acts
          li.querySelectorAll('.tl-act').forEach(function (a) {
            var i = +a.dataset.act;
            a.classList.remove('is-done', 'is-now', 'is-up');
            if (x.state === 'live' && actIdx >= 0) {
              a.classList.add(i < actIdx ? 'is-done' : (i === actIdx ? 'is-now' : 'is-up'));
              a.querySelector('.tl-act-tag').textContent = i === actIdx ? 'On stage' : (i === actIdx + 1 ? 'Up next' : '');
            } else {
              if (x.state === 'past') a.classList.add('is-done');
              a.querySelector('.tl-act-tag').textContent = '';
            }
          });
        });
        if (expandable) syncOpenCards(st.current);
        observeLive(st.current);
      }

      // Live-ticking bits
      model.flat.forEach(function (x) {
        var li = document.getElementById('item-' + x.id);
        if (!li) return;
        if (x.state === 'upcoming') {
          li.querySelector('.tl-chip').textContent = 'in ' + fmtIn(x.start - now);
        } else if (x.state === 'live') {
          var bar = li.querySelector('.tl-progress span');
          if (bar) bar.style.width = Math.min(100, (now - x.start) / (x.liveEnd - x.start) * 100).toFixed(2) + '%';
        }
      });

      renderHero(st, now);

      if (!didAutoScroll && st.phase === 'live') {
        didAutoScroll = true;
        setTimeout(function () { scrollToItem(st.current.id, true); }, 450);
      }
    }

    function scrollToItem(id, gentle) {
      var x = model.flat.find(function (f) { return f.id === id; });
      if (!x) return;
      if (x.block !== activeBlock) { userPickedTab = false; setBlock(x.block); }
      var li = document.getElementById('item-' + id);
      if (li) li.scrollIntoView({ behavior: gentle ? 'smooth' : 'smooth', block: 'center' });
    }

    // ── "Jump to now" floating button ──
    var io = null, liveVisible = true, liveId = null;
    function observeLive(cur) {
      liveId = cur ? cur.id : null;
      if (!jumpEl || !('IntersectionObserver' in global)) return;
      if (io) io.disconnect();
      if (!cur) { liveVisible = true; syncJump(); return; }
      io = new IntersectionObserver(function (entries) {
        liveVisible = entries[0].isIntersecting;
        syncJump();
      }, { threshold: 0.25 });
      var li = document.getElementById('item-' + cur.id);
      if (li) io.observe(li);
    }
    function syncJump() {
      if (!jumpEl) return;
      var x = liveId && model.flat.find(function (f) { return f.id === liveId; });
      var show = !!liveId && (!liveVisible || (!continuous && x && x.block !== activeBlock));
      jumpEl.classList.toggle('is-visible', show);
    }
    if (jumpEl) {
      jumpEl.addEventListener('click', function () {
        userPickedTab = false;
        if (liveId) scrollToItem(liveId);
      });
    }
    if (tabsEl) tabsEl.addEventListener('click', function () { setTimeout(syncJump, 0); });

    // ── Boot ──
    renderTabs();
    renderTimeline();
    renderBanner();
    onTick(update);

    subscribeOverride(event.key, function (data) {
      var timesChanged = data.delayMinutes !== ov.delayMinutes || data.delayFromId !== ov.delayFromId;
      ov = data || {};
      if (timesChanged) {
        model = buildModel(event, ov);
        renderTimeline();
      }
      renderBanner();
      lastSig = ''; heroSig = '';
      update(Clock.now());
    });
  }

  // ════════════════════════════════════════════════════════════
  //  NOW SHOWING — food station posters
  // ════════════════════════════════════════════════════════════
  function mountStations(opts) {
    var el = opts.container, countEl = opts.count, filterEl = opts.filters;
    var stations = opts.stations.map(function (s, i) {
      return Object.assign({ idx: i, openMs: Date.parse(s.open), closeMs: Date.parse(s.close) }, s);
    });
    var filter = 'all';
    var LAST_CALL = 15 * MIN;

    el.innerHTML = stations.map(function (s) {
      var titleLength = String(s.title || '').length;
      var titleClass = titleLength > 38 ? ' poster-title--xlong' : (titleLength > 24 ? ' poster-title--long' : '');
      return '<article class="poster poster--' + esc(s.theme) + '" id="station-' + esc(s.id) + '" data-id="' + esc(s.id) + '">' +
        '<div class="poster-ribbon"></div>' +
        '<div class="poster-art" aria-hidden="true"></div>' +
        '<p class="poster-billing">Priya &amp; Gautam present</p>' +
        '<h3 class="poster-title' + titleClass + '">' + esc(s.title) + '</h3>' +
        '<p class="poster-tagline">' + esc(s.tagline || '') + '</p>' +
        '<div class="poster-foot">' +
          '<span class="poster-showtimes">Showtimes</span>' +
          '<span class="poster-times">' + esc(rangeLabel(s.openMs, s.closeMs)) + '</span>' +
          '<span class="poster-status"></span>' +
        '</div></article>';
    }).join('');

    if (filterEl) {
      filterEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-filter]');
        if (!b) return;
        filter = b.dataset.filter;
        filterEl.querySelectorAll('[data-filter]').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        lastSig = '';
        update(Clock.now());
      });
    }

    var lastSig = '';
    function update(now) {
      var counts = { open: 0, soon: 0, closed: 0 };
      var sig = '';
      stations.forEach(function (s) {
        s.state = now < s.openMs ? 'soon' : (now < s.closeMs ? 'open' : 'closed');
        s.lastCall = s.state === 'open' && s.closeMs - now <= LAST_CALL;
        counts[s.state]++;
        sig += s.state + (s.lastCall ? '!' : '') + ',';
      });

      if (sig !== lastSig) {
        lastSig = sig;
        var rank = { open: 0, soon: 1, closed: 2 };
        // Open → soonest closing first; coming soon → soonest opening; closed → most recent first.
        var sorted = stations.slice().sort(function (a, b) {
          if (a.state !== b.state) return rank[a.state] - rank[b.state];
          if (a.state === 'open') return a.closeMs - b.closeMs || a.idx - b.idx;
          if (a.state === 'soon') return a.openMs - b.openMs || a.idx - b.idx;
          return b.closeMs - a.closeMs || a.idx - b.idx;
        });
        sorted.forEach(function (s, pos) {
          var card = document.getElementById('station-' + s.id);
          card.classList.remove('is-open', 'is-soon', 'is-closed', 'is-lastcall');
          card.classList.add('is-' + s.state);
          if (s.lastCall) card.classList.add('is-lastcall');
          card.querySelector('.poster-ribbon').textContent =
            s.lastCall ? 'Last Call' : ({ open: 'Now Showing', soon: 'Coming Soon', closed: 'That’s a Wrap' })[s.state];
          card.style.order = String(pos);
          card.hidden = filter !== 'all' && filter !== s.state;
        });
        if (countEl) {
          var bits = [];
          if (counts.open) bits.push('<b>' + counts.open + '</b> now showing');
          if (counts.soon) bits.push('<b>' + counts.soon + '</b> coming soon');
          if (counts.closed && !counts.open && !counts.soon) bits.push('All stations have closed');
          countEl.innerHTML = bits.join('<span aria-hidden="true"> · </span>');
        }
      }

      stations.forEach(function (s) {
        var st = document.getElementById('station-' + s.id).querySelector('.poster-status');
        var txt;
        if (s.state === 'open') txt = s.lastCall ? 'Closes in ' + fmtIn(s.closeMs - now) : 'Showing until ' + timeLabel(s.closeMs);
        else if (s.state === 'soon') txt = s.openMs - now < 6 * 3600000 ? 'Opens in ' + fmtIn(s.openMs - now) : 'Opens ' + timeLabel(s.openMs);
        else txt = 'Closed at ' + timeLabel(s.closeMs);
        if (st.textContent !== txt) st.textContent = txt;
      });
    }
    onTick(update);
  }

  // ════════════════════════════════════════════════════════════
  //  SEATING CHART SEARCH
  // ════════════════════════════════════════════════════════════
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Percentage-based centers measured from reception_floor_plan.png.
  // They stay aligned as the plan scales and allow a wider scrollable plan on phones.
  var SEAT_MAP_TABLES = [
    ['1', 45.5, 68.2], ['2', 55.0, 68.2], ['3', 35.9, 68.2], ['4', 64.4, 68.2],
    ['5', 40.0, 81.7], ['6', 60.2, 81.7], ['7', 25.9, 81.7], ['8', 74.8, 81.7],
    ['9', 21.8, 68.2], ['10', 79.4, 68.2], ['11', 25.9, 54.4], ['12', 74.8, 54.4],
    ['13', 21.9, 39.6], ['14', 79.0, 39.6], ['15', 25.9, 27.2], ['16', 74.8, 27.2],
    ['17', 14.8, 27.2], ['18', 85.5, 27.2], ['19', 10.7, 39.6], ['20', 89.9, 39.6],
    ['21', 16.3, 54.4], ['22', 84.5, 54.4], ['23', 10.7, 68.2], ['24', 89.9, 68.2],
    ['25', 16.3, 81.7], ['26', 84.5, 81.7], ['27', 6.6, 81.7], ['28', 94.1, 81.7],
    ['29', 6.6, 54.4], ['30', 94.1, 54.4], ['31', 6.6, 27.2], ['32', 94.1, 27.2],
    ['33', 19.8, 15.5], ['34', 80.5, 15.5],
    ['HT1', 34.9, 39.8, 'HT 1', true], ['HT2', 65.3, 39.8, 'HT 2', true]
  ];

  function seatTableKey(value) {
    var key = String(value == null ? '' : value).toUpperCase().replace(/\s+/g, '');
    if (/^HT[12]$/.test(key)) return key;
    var number = key.match(/\d+/);
    return number ? String(parseInt(number[0], 10)) : key;
  }

  function mountSeating(opts) {
    var input = opts.input, results = opts.results, statusEl = opts.status;
    var section = opts.section, promoteTarget = opts.promoteTarget;
    var floorPlan = opts.floorPlan, mapScroll = opts.mapScroll;
    var mapMarkers = opts.mapMarkers, mapCaption = opts.mapCaption;
    var promoteAt = opts.promoteAt ? Date.parse(opts.promoteAt) : null;
    var queryParam = opts.queryParam || 'name';
    var params = new URLSearchParams(global.location.search);
    var initialName = String(params.get(queryParam) || '').trim();
    var rows = [];

    if (initialName) input.value = initialName;

    if (mapMarkers) {
      mapMarkers.innerHTML = SEAT_MAP_TABLES.map(function (table) {
        var label = table[3] || table[0];
        return '<span class="seat-map-marker' + (table[4] ? ' is-head-table' : '') + '"' +
          ' data-table-key="' + table[0] + '" data-table-label="' + esc(label) + '"' +
          ' style="--seat-x:' + table[1] + '%;--seat-y:' + table[2] + '%">' +
          '<b>' + (table[4] ? esc(label) : 'Table ' + esc(label)) + '</b></span>';
      }).join('');
    }

    function hideFloorPlan() {
      if (!floorPlan) return;
      floorPlan.hidden = true;
      if (mapCaption) mapCaption.textContent = '';
      if (mapMarkers) mapMarkers.querySelectorAll('.seat-map-marker').forEach(function (marker) {
        marker.classList.remove('is-active');
      });
    }

    function highlightTable(table) {
      if (!floorPlan || !mapMarkers) return;
      var key = seatTableKey(table);
      var marker = mapMarkers.querySelector('[data-table-key="' + key + '"]');
      if (!marker) { hideFloorPlan(); return; }
      mapMarkers.querySelectorAll('.seat-map-marker').forEach(function (item) {
        item.classList.toggle('is-active', item === marker);
      });
      floorPlan.hidden = false;
      var label = marker.dataset.tableLabel;
      if (mapCaption) {
        mapCaption.textContent = (key.indexOf('HT') === 0 ? 'Head Table ' + key.slice(2) : 'Table ' + label) +
          ' is highlighted in gold. The dance floor is in the center of the room.';
      }
      if (mapScroll) requestAnimationFrame(function () {
        var left = marker.offsetLeft + marker.offsetWidth / 2 - mapScroll.clientWidth / 2;
        mapScroll.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
      });
    }

    if (section && promoteTarget && !isNaN(promoteAt)) {
      var homeMarker = document.createComment('seating-home');
      section.parentNode.insertBefore(homeMarker, section);
      var isPromoted = false;
      onTick(function (now) {
        var shouldPromote = now >= promoteAt;
        if (shouldPromote === isPromoted) return;
        isPromoted = shouldPromote;
        section.classList.toggle('is-promoted', isPromoted);
        if (isPromoted) promoteTarget.appendChild(section);
        else homeMarker.parentNode.insertBefore(section, homeMarker.nextSibling);
      });
    }

    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    function load() {
      try {
        WeddingData.getDb().collection('seating').doc('reception').get().then(function (snap) {
          var data = snap.exists ? snap.data() : null;
          rows = ((data && data.rows) || []).map(function (r) {
            var tokens = {};
            [r.n, r.f, r.l, r.x].forEach(function (v) { norm(v).split(' ').forEach(function (t) { if (t) tokens[t] = 1; }); });
            return { name: r.n, first: norm(r.f), full: norm(r.n), table: r.t, tokens: Object.keys(tokens) };
          });
          input.disabled = false;
          input.placeholder = 'Start typing your name…';
          setStatus(rows.length ? '' : 'The seating chart will appear here soon.');
          if (input.value) {
            search();
            if (initialName && section && Clock.now() < promoteAt) {
              section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }).catch(function (e) {
          console.warn('Seating load failed:', e && e.message);
          setStatus('Couldn’t load the seating chart — please check with the welcome table.');
        });
      } catch (e) {
        setStatus('Couldn’t load the seating chart — please check with the welcome table.');
      }
    }

    function find(q) {
      var qt = norm(q).split(' ').filter(Boolean);
      if (!qt.length) return [];
      var qFull = qt.join(' ');
      var out = [];
      rows.forEach(function (r) {
        var score = 0;
        for (var i = 0; i < qt.length; i++) {
          var best = 9;
          for (var j = 0; j < r.tokens.length; j++) {
            var t = r.tokens[j];
            if (t === qt[i]) { best = 0; break; }
            if (t.indexOf(qt[i]) === 0) best = Math.min(best, 1);
          }
          if (best === 9) return;
          score += best;
        }
        if (r.full === qFull) score -= 10;
        if (r.first.indexOf(qt[0]) === 0) score -= 0.5;
        out.push({ r: r, score: score });
      });
      out.sort(function (a, b) { return a.score - b.score || a.r.name.localeCompare(b.r.name); });
      return out.map(function (o) { return o.r; });
    }

    function tablemates(r) {
      return rows.filter(function (x) { return x.table === r.table && x !== r; })
        .map(function (x) { return x.name; }).sort();
    }

    function revealHTML(r) {
      var mates = tablemates(r);
      return '<div class="seat-reveal">' +
        '<p class="seat-reveal-name">' + esc(r.name) + '</p>' +
        '<p class="seat-reveal-label">You’re seated at</p>' +
        '<div class="seat-table"><span>Table</span><b>' + esc(r.table) + '</b></div>' +
        (mates.length ? '<p class="seat-mates"><span>Sharing your table</span>' + mates.map(esc).join(' · ') + '</p>' : '') +
        '<div style="margin-top: 18px;"><button type="button" class="seat-again" id="seat-again-btn">Search another name</button></div>' +
        '</div>';
    }

    function search() {
      var q = input.value;
      if (norm(q).length < 2) { results.innerHTML = ''; setStatus(''); hideFloorPlan(); return; }
      var found = find(q);
      if (!found.length) {
        hideFloorPlan();
        results.innerHTML = '<p class="seat-empty">We couldn’t find “' + esc(q.trim()) +
          '”. Try just your first or last name, or ask anyone at the welcome table.</p>';
        return;
      }
      var exact = found[0].full === norm(q);
      if (found.length === 1 || (exact && (found.length < 2 || found[1].full !== found[0].full))) {
        results.innerHTML = revealHTML(found[0]);
        highlightTable(found[0].table);
        return;
      }
      hideFloorPlan();
      var shown = found.slice(0, 12);
      results.innerHTML = '<ul class="seat-list">' + shown.map(function (r, i) {
        return '<li><button type="button" class="seat-row" data-i="' + i + '"><span>' + esc(r.name) +
          '</span><b>Table ' + esc(r.table) + '</b></button></li>';
      }).join('') + '</ul>' +
        (found.length > shown.length ? '<p class="seat-more">' + (found.length - shown.length) + ' more — keep typing to narrow it down</p>' : '');
      results._shown = shown;
    }

    results.addEventListener('click', function (e) {
      if (e.target.closest('#seat-again-btn')) {
        input.value = '';
        results.innerHTML = '';
        hideFloorPlan();
        input.focus();
        return;
      }
      var b = e.target.closest('.seat-row');
      if (!b || !results._shown) return;
      var selected = results._shown[+b.dataset.i];
      results.innerHTML = revealHTML(selected);
      highlightTable(selected.table);
    });

    var t = null;
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(search, 90); });

    input.disabled = true;
    input.placeholder = 'Loading seating chart…';
    load();
  }

  global.Live = {
    mountSchedule: mountSchedule,
    mountStations: mountStations,
    mountSeating: mountSeating,
    clock: Clock,
    timeLabel: timeLabel
  };
})(window);
