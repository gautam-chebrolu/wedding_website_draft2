/* ============================================================
   WEDDING WEBSITE — main.js
   Handles: splash screen + nav scroll/active state
   ============================================================ */

// ── Splash Screen ──────────────────────────────────────────────
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;

  // Lock scroll while splash is covering the page
  document.body.classList.add('splash-active');

  // Animation timeline:
  //   P draws:     0s    → 2.2s
  //   G draws:     0.25s → 2.45s
  //   P fill:      2.0s  → 2.6s
  //   G fill:      2.25s → 2.85s
  //   Tagline in:  2.4s  → 3.2s
  //   Hold:        3.2s  → 3.8s  (+600ms)
  //   Fade out:    3.8s  → 4.7s  (0.9s CSS transition)

  var totalAnimMs = 3200;
  var holdMs      = 600;

  setTimeout(function () {
    document.body.classList.remove('splash-active');
    splash.classList.add('splash-done');
  }, totalAnimMs + holdMs);
})();


// ── Navigation scroll effect + active link ────────────────────
(function () {
  var nav = document.querySelector('nav.site-nav');
  if (!nav) return;

  function onScroll() {
    if (window.scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Mark the active nav link based on the public clean URL.
  var currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('nav.site-nav ul li a').forEach(function (link) {
    var linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    if (linkPath === currentPath) {
      link.classList.add('active');
    }
  });
})();


// ── Food menu link: expanded menus are shared by their own direct URLs. ──
(function () {
  var ul = document.querySelector('nav.site-nav ul');
  if (!ul || ul.querySelector('a[href^="/food"]')) return;
  var li = document.createElement('li');
  var link = document.createElement('a');
  link.href = '/food';
  link.textContent = 'Food';
  li.appendChild(link);
  ul.appendChild(li);
  ul.classList.add('has-food-menu');
})();


// ── "● Live" nav pill (only during the Sangeet & wedding day) ──
(function () {
  var ul = document.querySelector('nav.site-nav ul');
  if (!ul) return;
  var now = Date.now();
  var windows = [
    { href: '/sangeet', from: '2026-11-20T12:00:00-05:00', to: '2026-11-21T03:00:00-05:00' },
    { href: '/wedding', from: '2026-11-21T05:00:00-05:00', to: '2026-11-22T03:00:00-05:00' }
  ];
  var hit = windows.find(function (w) { return now >= Date.parse(w.from) && now < Date.parse(w.to); });
  if (!hit) return;
  var li = document.createElement('li');
  li.innerHTML = '<a href="' + hit.href + '" class="nav-live" id="nav-live-link"><span class="nav-live-dot" aria-hidden="true"></span>Live</a>';
  ul.insertBefore(li, ul.firstChild);
  var page = window.location.pathname.replace(/\/+$/, '') || '/';
  if (page === hit.href) li.firstChild.classList.add('active');
})();
