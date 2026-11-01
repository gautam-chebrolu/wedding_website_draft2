/**
 * dev-server.js — local preview that behaves like Vercel.
 *
 *   node scripts/dev-server.js          → http://localhost:3001
 *   PORT=4000 node scripts/dev-server.js
 *
 * - Serves the static site with clean URLs (/sangeet → pages/sangeet.html)
 * - Runs /api/* functions (api/chat.js, api/live-admin.js) and reloads
 *   them on every request, so edits to facts.md apply immediately
 * - Loads secrets from .env.local (gitignored), the same names you set in
 *   Vercel: OPENAI_API_KEY, LIVE_ADMIN_PASSWORD, ...
 * - Never serves secrets: .env*, service-account-key.json, CSVs, api/_*
 *
 * Zero npm dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ── Load .env.local / .env ──────────────────────────────────
for (const file of ['.env.local', '.env']) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

const BLOCKED = [/^\.env/i, /service-account-key\.json$/i, /\.csv$/i, /^api[\\/]/i, /^scripts[\\/]/i, /^\.git/i, /^\.vercel/i, /^node_modules/i];

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

async function runFunction(name, req, res) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (name.startsWith('_') || !fs.existsSync(file)) return send(res, 404, 'Not found');
  // Fresh require so code/data edits apply without restarting.
  Object.keys(require.cache).forEach(k => {
    if (k.startsWith(path.join(ROOT, 'api')) || k.startsWith(path.join(ROOT, 'media'))) delete require.cache[k];
  });
  try {
    await require(file)(req, res);
  } catch (e) {
    console.error(`api/${name} crashed:`, e);
    if (!res.headersSent) send(res, 500, 'Function error');
    else res.end();
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');

  if (rel.startsWith('api/')) return runFunction(rel.slice(4).replace(/\/$/, ''), req, res);
  if (rel === 'hotels') { res.writeHead(308, { Location: '/travel' }); return res.end(); }

  // Match Vercel's cleanUrls behavior for old .html links.
  if (rel.endsWith('.html')) {
    const clean = rel === 'index.html' ? '/' : '/' + rel.slice(0, -5);
    res.writeHead(308, { Location: clean });
    return res.end();
  }

  if (!rel) rel = 'index.html';
  if (BLOCKED.some(rx => rx.test(rel))) return send(res, 404, 'Not found');

  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  if (!path.extname(file)) {
    const rootPage = file + '.html';
    const nestedPage = path.join(ROOT, 'pages', rel + '.html');
    if (fs.existsSync(rootPage)) file = rootPage;
    else if (fs.existsSync(nestedPage)) file = nestedPage;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  Wedding site → http://localhost:${PORT}`);
  console.log(`  Sangeet live → http://localhost:${PORT}/sangeet?now=2026-11-20T19:40`);
  console.log(`  Wedding live → http://localhost:${PORT}/wedding?now=2026-11-21T09:50`);
  console.log(`  OpenAI key   : ${process.env.OPENAI_API_KEY ? 'loaded ✓' : 'missing (add to .env.local)'}`);
  console.log(`  Admin pass   : ${process.env.LIVE_ADMIN_PASSWORD ? 'loaded ✓' : 'missing (add to .env.local)'}\n`);
});
