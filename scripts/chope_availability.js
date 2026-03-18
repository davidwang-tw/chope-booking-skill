#!/usr/bin/env node
const { run, jsonOut, buildWidgetUrl, detectState } = require('./openclaw_browser');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const rid = arg('rid');
const name = arg('name');
const date = arg('date');
const time = arg('time');
const adults = Number(arg('adults', '2'));
const children = Number(arg('children', '0'));

if (!rid || !name || !date || !time) {
  jsonOut({ status: 'failed', error: 'missing required args --rid --name --date --time' });
  process.exit(2);
}

try {
  run(['start']);
  const widgetEntry = buildWidgetUrl({ rid, name, date, time, adults, children });
  run(['open', widgetEntry]);
  run(['wait', '--ms', '2500']);
  const snapshot = run(['snapshot']);
  const state = detectState(snapshot);

  jsonOut({
    ...state,
    request: { rid, name, date, time, adults, children },
    widget_entry: widgetEntry,
    snapshot_preview: snapshot.slice(0, 4000)
  });
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
