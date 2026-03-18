#!/usr/bin/env node
const { run, jsonOut } = require('./openclaw_browser');

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
  run(['wait', '--ms', '1800']);
  const snapshot = run(['snapshot']);

  jsonOut({
    status: 'success',
    request: { query },
    search_url: url,
    note: 'Review snapshot in chat/browser and pick restaurant URL or rid for booking.',
    snapshot_preview: snapshot.slice(0, 4000)
  });
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
