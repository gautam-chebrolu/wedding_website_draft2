(function () {
  'use strict';

  var items = window.SPOT_IT_ITEMS;
  var scatter = document.getElementById('games-scatter');
  var loading = document.getElementById('games-loading');
  if (!scatter) return;
  if (!Array.isArray(items) || !items.length) {
    loading.textContent = 'Our pictures could not load. Please refresh to try again.';
    return;
  }

  var dialog = document.getElementById('games-story');
  var selectedNode = null;
  var detailImage = document.getElementById('games-detail-image');
  var detailTitle = document.getElementById('games-detail-title');
  var detailSummary = document.getElementById('games-detail-summary');
  var detailDescription = document.getElementById('games-detail-description');
  var position = document.getElementById('games-position');
  var motionButton = document.getElementById('games-motion');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var motionPaused = reducedMotion.matches;
  var order = [];
  var activeIndex = 0;
  var returnFocus = null;
  var lastWidth = 0;
  var resizeFrame = 0;

  function imageURL(item) {
    return '/media/spot_it/web/' + encodeURIComponent(item.file);
  }

  function shuffled(source) {
    var result = source.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = result[i];
      result[i] = result[j];
      result[j] = swap;
    }
    return result;
  }

  function layout() {
    var width = scatter.clientWidth;
    if (!width || width === lastWidth) return;
    lastWidth = width;
    var columns = Math.max(width < 340 ? 2 : 3, Math.min(8, Math.floor(width / 162)));
    var cellWidth = (width - 28) / columns;
    var cellHeight = Math.max(118, Math.min(182, cellWidth * 1.08));
    scatter.style.height = (Math.ceil(order.length / columns) * cellHeight + 30) + 'px';

    order.forEach(function (entry, index) {
      var col = index % columns;
      var row = Math.floor(index / columns);
      var size = Math.min(142, cellWidth * .71) * entry.size;
      // Keep each rotated picture inside its own loose cell, leaving room to drift.
      var jitterX = (cellWidth - size * 1.3) * .42;
      var jitterY = (cellHeight - size * 1.3) * .42;
      entry.node.style.setProperty('--size', size + 'px');
      entry.node.style.setProperty('--x', (14 + cellWidth * (col + .5) + entry.x * jitterX) + 'px');
      var stagger = (col % 2 ? .13 : -.13) * cellHeight;
      entry.node.style.setProperty('--y', (15 + cellHeight * (row + .5) + stagger + entry.y * jitterY) + 'px');
      if (col === 0) entry.node.dataset.edge = 'left';
      else if (col === columns - 1) entry.node.dataset.edge = 'right';
      else delete entry.node.dataset.edge;
    });
  }

  function renderScatter() {
    order = shuffled(items).map(function (item, index) {
      var li = document.createElement('li');
      li.className = 'games-item';
      li.style.setProperty('--rotation', (Math.random() * 22 - 11) + 'deg');
      li.style.setProperty('--duration', (4 + Math.random() * 4) + 's');
      li.style.setProperty('--delay', (-Math.random() * 8) + 's');
      var float = document.createElement('div');
      float.className = 'games-float';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'games-symbol';
      button.setAttribute('aria-label', item.name + ': open story');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'games-story');
      button.setAttribute('aria-describedby', 'games-peek-' + index);
      var img = document.createElement('img');
      img.src = imageURL(item);
      img.alt = '';
      img.loading = index < 16 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.width = 180;
      img.height = 180;
      var tooltip = document.createElement('span');
      tooltip.className = 'games-tooltip';
      var title = document.createElement('strong');
      title.textContent = item.name;
      var summary = document.createElement('span');
      summary.id = 'games-peek-' + index;
      summary.textContent = item.summary || '';
      summary.hidden = !item.summary;
      tooltip.append(title, summary);
      button.append(img, tooltip);
      button.addEventListener('click', function () { openStory(index, button); });
      float.append(button);
      li.append(float);
      return { item: item, node: li, size: .8 + Math.random() * .2, x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
    });
    scatter.replaceChildren.apply(scatter, order.map(function (entry) { return entry.node; }));
    lastWidth = 0;
    layout();
  }

  function showStory(index) {
    activeIndex = (index + order.length) % order.length;
    var item = order[activeIndex].item;
    if (selectedNode) {
      selectedNode.classList.remove('is-selected');
      selectedNode.querySelector('button').setAttribute('aria-expanded', 'false');
    }
    selectedNode = order[activeIndex].node;
    selectedNode.classList.add('is-selected');
    selectedNode.querySelector('button').setAttribute('aria-expanded', 'true');
    selectedNode.appendChild(dialog);
    dialog.hidden = false;
    detailImage.src = imageURL(item);
    detailImage.alt = item.name;
    detailTitle.textContent = item.name;
    detailSummary.textContent = item.summary || '';
    detailSummary.hidden = !item.summary;
    detailDescription.textContent = item.description || 'Every picture in our deck has a story. We’re putting this one into words — check back soon.';
    position.textContent = (activeIndex + 1) + ' / ' + order.length;
    // Warm the adjacent images for instant carousel navigation.
    [-1, 1].forEach(function (offset) {
      var next = new Image();
      next.src = imageURL(order[(activeIndex + offset + order.length) % order.length].item);
    });
    requestAnimationFrame(function () {
      var bounds = selectedNode.getBoundingClientRect();
      if (bounds.top < 130 || bounds.bottom > innerHeight - 40) selectedNode.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    });
  }

  function openStory(index, button) {
    if (selectedNode === order[index].node && !dialog.hidden) { closeStory(); return; }
    returnFocus = button;
    showStory(index);
    document.body.dataset.storyOpen = 'true';
  }

  function updateMotion() {
    document.body.dataset.motionPaused = String(motionPaused);
    motionButton.setAttribute('aria-pressed', String(motionPaused));
    motionButton.textContent = motionPaused ? 'Resume motion' : 'Pause motion';
    // System reduced motion always wins, including after changing the setting.
    motionButton.hidden = reducedMotion.matches;
  }

  function closeStory() {
    dialog.hidden = true;
    delete document.body.dataset.storyOpen;
    if (selectedNode) {
      selectedNode.classList.remove('is-selected');
      selectedNode.querySelector('button').setAttribute('aria-expanded', 'false');
      selectedNode.querySelector('button').focus({ preventScroll: true });
    }
    selectedNode = null;
    scatter.after(dialog);
  }
  document.getElementById('games-close').addEventListener('click', closeStory);
  document.getElementById('games-previous').addEventListener('click', function () { showStory(activeIndex - 1); document.getElementById('games-previous').focus({ preventScroll: true }); });
  document.getElementById('games-next').addEventListener('click', function () { showStory(activeIndex + 1); document.getElementById('games-next').focus({ preventScroll: true }); });
  document.addEventListener('click', function (event) {
    if (selectedNode && !event.target.closest('.games-item, #games-story')) closeStory();
  });
  document.addEventListener('keydown', function (event) {
    if (!selectedNode || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') closeStory();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showStory(activeIndex + (event.key === 'ArrowLeft' ? -1 : 1));
      document.getElementById(event.key === 'ArrowLeft' ? 'games-previous' : 'games-next').focus({ preventScroll: true });
    }
  });

  var swipeStart = null;
  var detail = document.getElementById('games-detail');
  detail.addEventListener('touchstart', function (event) {
    swipeStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  detail.addEventListener('touchend', function (event) {
    if (!swipeStart) return;
    var dx = event.changedTouches[0].clientX - swipeStart.x;
    var dy = event.changedTouches[0].clientY - swipeStart.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) showStory(activeIndex + (dx < 0 ? 1 : -1));
    swipeStart = null;
  }, { passive: true });
  detail.addEventListener('touchcancel', function () { swipeStart = null; }, { passive: true });

  motionButton.addEventListener('click', function () { motionPaused = !motionPaused; updateMotion(); });
  reducedMotion.addEventListener('change', function () { motionPaused = reducedMotion.matches; updateMotion(); });
  document.getElementById('games-shuffle').addEventListener('click', function () { if (selectedNode) closeStory(); renderScatter(); });
  var observer = new ResizeObserver(function () {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  });
  observer.observe(scatter);

  renderScatter();
  updateMotion();
  loading.hidden = true;
  document.getElementById('games-count').textContent = items.length + ' little stories';
  document.getElementById('games-toolbar').hidden = false;
})();
