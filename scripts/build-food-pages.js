/** Regenerate all food pages after editing media/food-menu.json. No dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const menus = JSON.parse(fs.readFileSync(path.join(root, 'media/food-menu.json'), 'utf8'));
const labels = { v: 'Vegetarian', vg: 'Vegan', df: 'Dairy-free', gf: 'Gluten-free', nf: 'Nut-free', nuts: 'Contains nuts' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const versions = { food: ['wedding', 'reception'], 'food-sangeet': ['sangeet', 'wedding', 'reception'], 'food-haldi': ['haldi', 'sangeet', 'wedding', 'reception'] };
function renderItem(item) {
  const tags = new Set(item.tags);
  const displayTags = item.tags.filter(tag => tag !== 'nf');
  if (tags.has('nuts')) {
    tags.delete('nf');
  } else {
    tags.add('nf');
    displayTags.push('nf');
  }
  if (tags.has('vg') && !item.review) { tags.add('df'); tags.add('v'); }
  return `<li class="menu-item" data-diets="${escape([...tags].join(' '))}">
    <div class="dish-heading"><h4>${escape(item.name)}</h4><span class="dish-match" hidden>✦ Draft match</span></div>
    ${item.translation ? `<p class="dish-translation"><i>${escape(item.translation)}</i></p>` : ''}
    ${item.note ? `<p class="dish-note">${escape(item.note)}</p>` : ''}
    <p class="dish-tags">${displayTags.length ? displayTags.map(t => `<span${t === 'nuts' ? ' class="contains-nuts"' : ''}>${labels[t]}</span>`).join('<span class="tag-divider" aria-hidden="true"> · </span>') : 'Dietary details to come'}${item.review ? '<span class="review-label"> · Label under review</span>' : ''}</p>
    ${item.review ? `<p class="dish-review">${escape(item.review)}</p>` : ''}
  </li>`;
}
function renderEvent(event, index) {
 return `<section class="menu-event" id="${event.id}" aria-labelledby="heading-${event.id}">
    <header class="event-heading"><span class="event-number" aria-hidden="true">0${index + 1}</span><div><p class="menu-eyebrow">${event.date}</p><h2 id="heading-${event.id}">${event.name}</h2><p class="event-venue">${escape(event.venue)}</p></div></header>
    <p class="event-intro">${escape(event.intro)}</p>
    ${event.pending ? `<p class="pending-menu">${escape(event.pending)}</p>` : `<div class="menu-columns">${event.courses.map(course => `<section class="menu-course"><h3>${escape(course.title)}</h3><ul>${course.items.map(renderItem).join('')}</ul></section>`).join('')}</div><p class="event-empty" hidden>No draft matches for these selections at ${event.name}. Dietary details may still be incomplete.</p>`}
  </section>`;
}
for (const [slug, ids] of Object.entries(versions)) {
 const events = ids.map(id => menus.find(event => event.id === id));
 const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Our Table — Priya &amp; Gautam</title>
  <meta name="description" content="Explore the ${events.map(e => e.name).join(', ')} menus and highlight dishes by dietary preference." />
  <meta name="robots" content="noindex" />
  <link rel="icon" href="/media/wedding_logo.svg" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <link rel="stylesheet" href="/assets/css/food.css" />
  <script defer src="/assets/js/main.js"></script>
  <script defer src="/assets/js/food.js"></script>
</head>
<body class="food-page">
  <a class="food-skip" href="#menu">Skip to menus</a>
  <nav class="site-nav scrolled" aria-label="Main navigation">
    <a href="/" class="nav-logo" aria-label="Home"><img src="/media/wedding_logo.svg" alt="Priya &amp; Gautam" /></a>
    <ul><li><a href="/schedule">Schedule / RSVP</a></li><li><a href="/travel">Travel</a></li><li><a href="/funds">Gifts</a></li><li><a href="/pictures">Pictures</a></li></ul>
  </nav>
  <main class="food-main">
    <header class="food-hero"><p class="menu-eyebrow">Priya &amp; Gautam · November 2026</p><h1>Our Table</h1><p class="food-subtitle">Good food. Wonderful company.</p><div class="food-ornament" aria-hidden="true">✦</div><p class="food-welcome">A taste of the celebrations, from the first bite to the last sweet.<br />Find a little of what you love.</p></header>
    <nav class="event-index" aria-label="Jump to an event menu">${events.map(e => `<a href="#${e.id}">${e.name}</a>`).join('')}</nav>
    <section class="dietary-tools" aria-labelledby="dietary-title">
      <h2 id="dietary-title">Find your favorites</h2>
      <p id="diet-help">Choose your dietary needs to highlight dishes. Multiple selections must all match. The full menu stays in view. Nut-free highlights every dish not tagged “Contains nuts.”</p>
      <form id="diet-form" hidden>
        <fieldset aria-describedby="diet-help"><legend class="sr-only">Dietary preferences</legend><div class="diet-options">${['v','vg','df','gf','nf'].map(key => `<label class="diet-option"><input type="checkbox" name="diet" value="${key}" /> <span>${labels[key]}</span></label>`).join('')}</div></fieldset>
        <div class="diet-actions"><label class="matches-toggle"><input type="checkbox" id="matches-only" /> Show matches only</label><button type="reset" id="clear-diets">Clear selections</button></div>
      </form>
      <p id="diet-status" class="diet-status" role="status" aria-live="polite" aria-atomic="true">All dishes are shown. Dietary labels are provisional.</p>
      <noscript><p>Enable JavaScript to highlight dishes. You can still browse the complete menus below.</p></noscript>
    </section>
    <aside class="menu-notice" aria-label="About dietary information"><p><strong>A menu in the making.</strong> Dishes and event menus may change. Dietary labels come from our caterer’s draft and are awaiting confirmation. Highlights show draft matches, not confirmed allergy-safe dishes. Missing labels do not mean a dish is free of an ingredient.</p><p>The caterer notes that cooking oil may contain soy. Nut-free labels mean no nuts are listed in the draft; ingredients and preparation still need confirmation. Soy-free options are not yet confirmed. For allergies, please check ingredients and preparation with the catering team before eating.</p></aside>
    <div id="menu">${events.map(renderEvent).join('\n')}</div>
    <footer class="food-footer"><span aria-hidden="true">✦</span><p>Made for gathering.</p><p class="menu-eyebrow">With love, Priya &amp; Gautam</p><a href="/">Back to our wedding website</a></footer>
  </main>
</body>
</html>\n`;
 fs.writeFileSync(path.join(root, 'pages', slug + '.html'), html.replace(/[ \t]+$/gm, ''));
 console.log(`Built /${slug}: ${events.map(e => e.name).join(', ')}`);
}
