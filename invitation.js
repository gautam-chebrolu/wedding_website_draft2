/* ============================================================
   DIGITAL INVITATION — invitation.js
   Handles: opening sequence, animation timing, music, particles
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── DOM References ───────────────────────────────────────── */
  const openingScreen = document.getElementById('opening-screen');
  const openBtn = document.getElementById('open-btn');
  const invContainer = document.getElementById('invitation-container');
  const mainCard = document.getElementById('main-card');
  const audio = document.getElementById('bg-music');
  const musicToggle = document.getElementById('music-toggle');
  const particlesEl = document.getElementById('particles');

  let musicPlaying = false;

  /* ── Open Invitation ──────────────────────────────────────── */
  openBtn.addEventListener('click', () => {
    // Fade out opening screen
    openingScreen.classList.add('fade-out');

    setTimeout(() => {
      openingScreen.style.display = 'none';

      // Show invitation
      invContainer.classList.add('show');
      musicToggle.classList.add('show');

      // Try to play music
      if (audio) {
        audio.volume = 0.4;
        audio.play().then(() => {
          musicPlaying = true;
          musicToggle.classList.add('playing');
        }).catch(() => {
          // Autoplay blocked — user can click music toggle
          musicPlaying = false;
        });
      }

      // Start animation sequence
      startAnimationSequence();

      // Create floating particles
      createParticles();

    }, 900);
  });

  /* ── Music Toggle ─────────────────────────────────────────── */
  musicToggle.addEventListener('click', () => {
    if (!audio) return;

    if (musicPlaying) {
      audio.pause();
      musicPlaying = false;
      musicToggle.classList.remove('playing');
    } else {
      audio.play().then(() => {
        musicPlaying = true;
        musicToggle.classList.add('playing');
      }).catch(() => { });
    }
  });

  /* ── Animation Sequence ───────────────────────────────────── */
  function startAnimationSequence() {
    // Step 1: Show the card (border draws + green fill via CSS)
    setTimeout(() => {
      mainCard.classList.add('visible');
    }, 200);

    // Step 2: Animate content elements in sequence
    // Each .anim-el gets revealed with staggered timing
    const animEls = document.querySelectorAll('.anim-el');
    const delays = [
      2400,   // 0: Ganesha icon
      2900,   // 1: Parent request text
      3600,   // 2: PRIYA
      4000,   // 3: "to"
      4400,   // 4: GAUTAM
      4900,   // 5: Son's parents
      5600,   // 6: Date block
      6800,   // 7: RSVP card
    ];

    animEls.forEach((el, i) => {
      const delay = delays[i] !== undefined ? delays[i] : (i * 500 + 2400);
      setTimeout(() => {
        el.classList.add('anim-visible');
      }, delay);
    });

    // Scroll to RSVP card after it appears
    setTimeout(() => {
      const rsvpCard = document.getElementById('rsvp-card');
      if (rsvpCard) {
        rsvpCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 8000);
  }

  /* ── Floating Particles ───────────────────────────────────── */
  function createParticles() {
    const count = 25;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';

      // Random properties
      const size = Math.random() * 4 + 1.5;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (Math.random() * 8 + 8) + 's';
      p.style.animationDelay = (Math.random() * 10) + 's';

      particlesEl.appendChild(p);
    }
  }

  /* ── Audio Error Handling ─────────────────────────────────── */
  if (audio) {
    audio.addEventListener('error', () => {
      // Hide music toggle if audio file doesn't exist
      musicToggle.style.display = 'none';
    });
  }

});