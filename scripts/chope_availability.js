#!/usr/bin/env node
const { run, jsonOut, buildWidgetUrl, waitForState, validateBookingRequest, redactBookingInput } = require('./openclaw_browser');

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

const validated = validateBookingRequest({
  rid,
  restaurant: name,
  date,
  time,
  adults,
  children
});
if (!validated.ok) {
  jsonOut({ status: 'failed', error: 'input validation failed', details: validated.errors });
  process.exit(2);
}

try {
  run(['start']);
  const norm = validated.normalized;
  const widgetEntry = buildWidgetUrl({
    rid: norm.rid,
    name: norm.restaurant,
    date: norm.date,
    time: norm.time,
    adults: norm.adults,
    children: norm.children
  });
  run(['open', widgetEntry]);
  const detected = waitForState({ attempts: 6, intervalMs: 1500 });
  const snapshot = detected.snapshot;
  const state = detected.state;

  jsonOut({
    ...state,
    request: redactBookingInput({
      rid: norm.rid,
      restaurant: norm.restaurant,
      date: norm.date,
      time: norm.time,
      adults: norm.adults,
      children: norm.children
    }),
    widget_entry: widgetEntry,
    detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
    snapshot_preview: snapshot.slice(0, 4000)
  });
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
