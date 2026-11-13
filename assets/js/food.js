/* Progressive enhancement: complete menus remain readable without JavaScript. */
(function () {
  'use strict';
  var form = document.getElementById('diet-form');
  if (!form) return;
  var choices = Array.from(form.querySelectorAll('[name="diet"]'));
  var only = document.getElementById('matches-only');
  var status = document.getElementById('diet-status');
  var items = Array.from(document.querySelectorAll('.menu-item'));
  function update() {
    var selected = choices.filter(function (input) { return input.checked; });
    var active = selected.length > 0;
    var count = 0;
    items.forEach(function (item) {
      var diets = item.dataset.diets.split(' ');
      var match = active && selected.every(function (input) { return diets.includes(input.value); });
      if (match) count++;
      item.classList.toggle('is-match', match);
      item.querySelector('.dish-match').hidden = !match;
      item.hidden = active && only.checked && !match;
    });
    document.querySelectorAll('.menu-course').forEach(function (course) {
      course.hidden = !Array.from(course.querySelectorAll('.menu-item')).some(function (item) { return !item.hidden; });
    });
    document.querySelectorAll('.menu-event').forEach(function (event) {
      var empty = event.querySelector('.event-empty');
      if (empty) empty.hidden = !(active && only.checked && !event.querySelector('.is-match'));
    });
    if (!active) {
      status.textContent = 'All ' + items.length + ' dishes are shown. Choose a dietary need to highlight draft matches.';
    } else {
      var names = selected.map(function (input) { return input.nextElementSibling.textContent; });
      status.textContent = count + ' draft ' + (count === 1 ? 'match' : 'matches') + ' for ' + names.join(' + ') + '. ' +
        (only.checked ? 'Other dishes are hidden.' : 'The full menu is shown; matches are highlighted.') +
        (count ? ' Labels await caterer confirmation.' : ' Labels may be incomplete; ask the catering team.');
    }
  }
  form.hidden = false;
  form.addEventListener('change', update);
  form.addEventListener('reset', function () { window.setTimeout(update, 0); });
  // Account for browser-restored checkbox values on back/forward navigation.
  window.addEventListener('pageshow', update);
  update();
})();
