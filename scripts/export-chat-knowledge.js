/** Explicit public data handoff; this website never imports the messaging repository. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const websiteRoot = path.resolve(__dirname, '..');
function buildPublicKnowledge() {
  const privateEvents = new Set(['Ganesh Puja', 'Haldi', 'Satyanarayana Puja']);
  const events = Object.entries(require(path.join(websiteRoot, 'media/events_data')))
    .map(([key, value]) => privateEvents.has(key)
      ? { name: value.name, date: value.date, time: value.time, private: true } : { ...value });
  const schedule = structuredClone(require(path.join(websiteRoot, 'media/live_schedule_data')));
  const factsText = fs.readFileSync(path.join(websiteRoot, 'api/_data/facts.md'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').trim();
  const facts = factsText.split(/^## /m).filter(Boolean).map((part, index) => {
    const [topic, ...body] = part.trim().split('\n');
    return { id: `seed-${index}`, topic, answer: body.join('\n').trim(), audience: 'public', published: true, version: 1 };
  });
  const warnings = [];
  for (const event of Object.values(schedule)) for (const block of event.blocks) for (const item of block.items) {
    if (item.time) {
      item.withheld = true;
      warnings.push({ event: event.key, item: item.id, start: item.start, display: item.time,
        reason: 'Display override requires organizer review; withheld from assistant until resolved.' });
    }
  }
  const payload = { events, schedule, facts, warnings };
  return { ...payload, version: createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16) };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : undefined;
    if (!output || output.startsWith('--')) throw new Error('Usage: node scripts/export-chat-knowledge.js --output PUBLIC_EXPORT.json');
    const destination = path.resolve(output), payload = buildPublicKnowledge();
    fs.writeFileSync(destination, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output: destination, version: payload.version, facts: payload.facts.length,
      scheduleWarnings: payload.warnings.length, note: 'Public bootstrap export only; existing files are never overwritten.' }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildPublicKnowledge };
