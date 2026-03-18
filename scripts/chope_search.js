#!/usr/bin/env node
const { run, jsonOut, browserEvaluate } = require('./openclaw_browser');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const query = arg('query', '').trim();
if (!query) {
  jsonOut({ status: 'failed', error: 'missing --query' });
  process.exit(2);
}

try {
  run(['start']);
  const url = `https://www.chope.co/singapore-restaurants?query=${encodeURIComponent(query)}`;
  run(['open', url]);
  let snapshot = '';
  for (let i = 0; i < 5; i += 1) {
    if (i > 0) run(['wait', '--ms', '1200']);
    snapshot = run(['snapshot']);
    if (snapshot.length > 200) break;
  }

  let candidates = [];
  try {
    const result = browserEvaluate(`() => {
      const q = ${JSON.stringify(query.toLowerCase())};
      const tokens = q.split(/\\s+/).filter(Boolean);
      const anchors = Array.from(document.querySelectorAll('a[href*="chope.co"]'));
      const items = [];
      for (const a of anchors) {
        const name = (a.textContent || '').trim().replace(/\\s+/g, ' ');
        const href = a.href || '';
        if (!name || name.length < 2) continue;
        const ridFromUrl = (() => {
          try {
            const u = new URL(href, location.origin);
            return u.searchParams.get('rid') || '';
          } catch (_) {
            return '';
          }
        })();
        const lower = name.toLowerCase();
        let score = 0;
        for (const t of tokens) if (lower.includes(t)) score += 1;
        if (ridFromUrl) score += 1;
        items.push({
          rid: ridFromUrl || null,
          name,
          area: null,
          cuisine: null,
          booking_url: href,
          confidence: Math.min(0.99, Math.max(0.2, score / Math.max(1, tokens.length + 1)))
        });
      }
      const dedup = new Map();
      for (const it of items) {
        const key = (it.rid || '') + '|' + it.name.toLowerCase();
        const prev = dedup.get(key);
        if (!prev || it.confidence > prev.confidence) dedup.set(key, it);
      }
      return Array.from(dedup.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 12);
    }`);
    if (Array.isArray(result)) candidates = result;
  } catch (_) {
    candidates = [];
  }

  jsonOut({
    status: 'success',
    request: { query },
    search_url: url,
    candidates,
    note: candidates.length
      ? 'Structured candidates extracted. Confirm selected candidate rid/name before booking.'
      : 'No structured candidates extracted; review snapshot manually.',
    snapshot_preview: snapshot.slice(0, 4000)
  });
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
