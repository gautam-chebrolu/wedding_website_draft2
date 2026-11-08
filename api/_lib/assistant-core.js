/** Shared channel-independent assistant. The Firebase package copies this at build time. */
const TZ = 'America/New_York';
const fmtNow = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
});

function sanitizeHistory(raw, { maxMessages = 12, maxChars = 800 } = {}) {
  if (!Array.isArray(raw)) return [];
  const clean = raw.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, maxChars) }))
    .filter(m => m.content).slice(-maxMessages);
  while (clean.length && clean[0].role !== 'user') clean.shift();
  return clean;
}

function createAssistant({ loadContext, model = (process.env.OPENAI_MODEL || '').trim() || 'gpt-6-luna',
  apiKey = () => process.env.OPENAI_API_KEY, fetchImpl = fetch, timeoutMs = 20000 }) {
  async function call({ history, now = Date.now(), channel = 'web', context: suppliedContext }, stream) {
    const context = suppliedContext || await loadContext({ now });
    const messages = [
      { role: 'system', content: context },
      { role: 'system', content: `Current date and time: ${fmtNow.format(new Date(now))} (Eastern). ` +
        (channel === 'sms' ? 'Reply in plain text, no Markdown. Use complete absolute website URLs. Keep under 60 words.' : '') },
      ...sanitizeHistory(history)
    ];
    const body = { model, messages, stream };
    if (/^(gpt-(?:5|6)|o\d)/.test(model)) {
      body.max_completion_tokens = 400;
      if (/^gpt-6/.test(model)) body.reasoning_effort = /^gpt-6(?:-luna|-sol|\.1-terra)(?:-|$)/.test(model) ? 'none' : 'low';
      else body.reasoning_effort = /^gpt-5\.6/.test(model) ? 'none' : 'minimal';
    } else { body.max_tokens = 300; body.temperature = 0.3; }
    if (!apiKey()) throw Object.assign(new Error('Assistant not configured'), { status: 503 });
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw Object.assign(new Error(`Assistant upstream ${res.status}`), { status: res.status === 429 ? 429 : 502 });
    return res;
  }
  async function answer(opts) {
    const res = await call(opts, false);
    const body = await res.json();
    const text = (body.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Empty assistant answer');
    return text;
  }
  async function streamAnswer(opts, onToken) {
    const res = await call(opts, true);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';
    function line(raw) {
      if (!raw.startsWith('data:')) return;
      const data = raw.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let parsed;
      try { parsed = JSON.parse(data); } catch { return; }
      const token = parsed.choices?.[0]?.delta?.content;
      if (token) { full += token; onToken(token); }
    }
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          line(buffer.slice(0, nl).trim()); buffer = buffer.slice(nl + 1);
        }
      }
      line((buffer + decoder.decode()).trim());
    } finally { reader.releaseLock(); }
    return full;
  }
  return { answer, streamAnswer, sanitizeHistory, MODEL: model };
}
module.exports = { createAssistant, sanitizeHistory };
