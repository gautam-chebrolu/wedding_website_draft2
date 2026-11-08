const { createHmac } = require('node:crypto');
/** Keep the browser's plain-text streaming contract while calling the shared backend. */
async function proxyAnswer({ history, ip, onToken }) {
  const url = process.env.MESSAGING_ASSISTANT_URL;
  const token = process.env.WEB_CHAT_SERVICE_TOKEN;
  if (!token) throw Object.assign(new Error('Messaging adapter is not configured'), { status: 503 });
  if (!url?.startsWith('https://')) throw Object.assign(new Error('Messaging URL must use HTTPS'), { status: 503 });
  const res = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      'X-Wedding-Client-Key': createHmac('sha256', token).update(ip).digest('hex') },
    body: JSON.stringify({ messages: history })
  });
  if (!res.ok) throw Object.assign(new Error('Messaging assistant unavailable'), { status: res.status === 429 ? 429 : 502 });
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let full = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) { full += text; onToken(text); }
    }
    const tail = decoder.decode();
    if (tail) { full += tail; onToken(tail); }
  } finally { reader.releaseLock(); }
  return full;
}
module.exports = { proxyAnswer };
