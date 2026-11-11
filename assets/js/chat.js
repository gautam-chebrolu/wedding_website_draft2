/* ============================================================
   WEDDING WEBSITE — chat.js
   Inline "Ask us anything" chatbot. Renders into any element with
   [data-chat] (data-page="sangeet" | "wedding" picks suggestions).

   Talks to /api/chat (Vercel serverless function). The OpenAI key
   lives ONLY on the server — nothing secret is in this file.
   ============================================================ */

(function () {
  'use strict';

  var MAX_HISTORY = 12;          // messages kept for context
  var MAX_INPUT = 500;           // characters per question

  var SUGGESTIONS = {
    questions: [
      'What should I wear to the wedding?',
      'How do I find my event schedule?',
      'What transportation is available?',
      'What is a baraat?'
    ],
    sangeet: [
      'What should I wear tonight?',
      'What is a sangeet?',
      'When does the biryani open?',
      'Is there a shuttle back to the hotel?'
    ],
    wedding: [
      'What is a baraat?',
      'What time does the ceremony start?',
      'Can I wear pink?',
      'When is dinner served?'
    ],
    schedule: [
      'What should I wear to my event?',
      'Where is the venue?',
      'Is there a shuttle to the Sangeet?',
      'What is a baraat?'
    ]
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Tiny, safe formatter: escape first, then **bold**, links, line breaks. */
  function format(text) {
    var html = esc(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    html = html.replace(/(^|\s)(\+?1?[-. ]?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4})/g, function (m, pre, num) {
      return pre + '<a href="tel:' + num.replace(/[^\d+]/g, '') + '">' + num + '</a>';
    });
    return html.replace(/\n/g, '<br>');
  }

  function mount(root) {
    var page = root.getAttribute('data-page') || 'general';
    var storeKey = 'pg_chat_' + page;
    var history = [];
    try { history = JSON.parse(sessionStorage.getItem(storeKey) || '[]'); } catch (e) { history = []; }
    var busy = false;

    root.innerHTML =
      '<div class="chat">' +
        '<div class="chat-head">' +
          '<span class="chat-orb" aria-hidden="true"></span>' +
          '<div><h2>Ask Us Anything</h2>' +
          '<p>Times, attire, directions, and what all the traditions mean</p></div>' +
        '</div>' +
        '<div class="chat-log" id="chat-log-' + esc(page) + '" role="log" aria-live="polite"></div>' +
        '<div class="chat-suggest" id="chat-suggest-' + esc(page) + '"></div>' +
        '<form class="chat-form" id="chat-form-' + esc(page) + '" autocomplete="off">' +
          '<label for="chat-input-' + esc(page) + '" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Your question</label>' +
          '<input id="chat-input-' + esc(page) + '" class="chat-input" type="text" maxlength="' + MAX_INPUT + '" placeholder="Ask a question…" enterkeyhint="send" />' +
          '<button type="submit" class="chat-send" id="chat-send-' + esc(page) + '" aria-label="Send">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>' +
          '</button>' +
        '</form>' +
        '<p class="chat-foot">AI assistant — it can make mistakes. For anything urgent, call or text ' +
          '<a href="tel:+19197575166">919-757-5166</a>.' +
          '<button type="button" class="chat-clear" id="chat-clear-' + esc(page) + '">Clear chat</button></p>' +
      '</div>';

    var log = root.querySelector('.chat-log');
    var suggest = root.querySelector('.chat-suggest');
    var form = root.querySelector('.chat-form');
    var input = root.querySelector('.chat-input');
    var sendBtn = root.querySelector('.chat-send');
    var clearBtn = root.querySelector('.chat-clear');

    function bubble(role, text) {
      var el = document.createElement('div');
      el.className = 'chat-msg chat-msg--' + role;
      el.innerHTML = '<div class="chat-bubble">' + format(text) + '</div>';
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    function renderAll() {
      log.innerHTML = '';
      bubble('bot', 'Hi! I can help with schedules, what to wear, addresses, shuttles, and what any of the wedding traditions mean. What would you like to know?');
      history.forEach(function (m) { bubble(m.role === 'user' ? 'user' : 'bot', m.content); });
      renderSuggestions();
    }

    function renderSuggestions() {
      var list = SUGGESTIONS[page] || SUGGESTIONS.wedding;
      suggest.hidden = history.length > 0;
      suggest.innerHTML = list.map(function (q, i) {
        return '<button type="button" class="chat-chip" id="chat-chip-' + esc(page) + '-' + i + '">' + esc(q) + '</button>';
      }).join('');
    }

    function save() {
      history = history.slice(-MAX_HISTORY);
      try { sessionStorage.setItem(storeKey, JSON.stringify(history)); } catch (e) { /* private mode */ }
    }

    async function ask(question) {
      question = String(question || '').trim().slice(0, MAX_INPUT);
      if (!question || busy) return;
      busy = true;
      sendBtn.disabled = true;
      suggest.hidden = true;
      input.value = '';

      bubble('user', question);
      history.push({ role: 'user', content: question });

      var botEl = bubble('bot', '');
      var bubbleEl = botEl.querySelector('.chat-bubble');
      bubbleEl.innerHTML = '<span class="chat-typing" aria-label="Typing"><i></i><i></i><i></i></span>';
      botEl.classList.add('is-pending');

      var answer = '';
      try {
        var payload = { messages: history.slice(-MAX_HISTORY), page: page };
        if (window.Live && Live.clock && Live.clock.simulated) payload.now = new Date(Live.clock.now()).toISOString();

        var res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok || !res.body) {
          var msg = res.status === 429
            ? 'Lots of questions right now — please try again in a minute!'
            : 'Sorry, I couldn’t answer that just now. Please try again, or ask a family member.';
          throw new Error(msg);
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        botEl.classList.remove('is-pending');
        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          answer += decoder.decode(chunk.value, { stream: true });
          bubbleEl.innerHTML = format(answer);
          log.scrollTop = log.scrollHeight;
        }
        answer = answer.trim();
        if (!answer) throw new Error('Sorry, I didn’t catch that — could you rephrase?');
        history.push({ role: 'assistant', content: answer });
        save();
      } catch (e) {
        botEl.classList.remove('is-pending');
        botEl.classList.add('is-error');
        var friendly = e && e.message && !/fetch|network|Failed/i.test(e.message)
          ? e.message
          : 'I’m having trouble connecting. Please check your signal and try again.';
        bubbleEl.innerHTML = format(friendly);
        history.pop();          // drop the unanswered question
        save();
      } finally {
        busy = false;
        sendBtn.disabled = false;
      }
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    suggest.addEventListener('click', function (e) {
      var chip = e.target.closest('.chat-chip');
      if (chip) ask(chip.textContent);
    });
    clearBtn.addEventListener('click', function () {
      history = [];
      save();
      renderAll();
      input.focus();
    });

    renderAll();
  }

  function init() {
    document.querySelectorAll('[data-chat]').forEach(mount);
    initDrawer();
  }

  function initDrawer() {
    var drawer = document.querySelector('[data-chat-drawer]');
    var toggle = document.querySelector('[data-chat-drawer-toggle]');
    var close = document.querySelector('[data-chat-drawer-close]');
    var backdrop = document.querySelector('[data-chat-drawer-backdrop]');
    if (!drawer || !toggle || !close || !backdrop) return;

    function setOpen(open) {
      drawer.classList.toggle('is-open', open);
      backdrop.hidden = !open;
      requestAnimationFrame(function () { backdrop.classList.toggle('is-open', open); });
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('chat-drawer-open', open);
      if (open) {
        var input = drawer.querySelector('.chat-input');
        if (input) setTimeout(function () { input.focus(); }, 320);
      } else {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () { setOpen(true); });
    close.addEventListener('click', function () { setOpen(false); });
    backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
