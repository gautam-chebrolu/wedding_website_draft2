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

  // Mark the active nav link based on current page filename
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.site-nav ul li a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();
