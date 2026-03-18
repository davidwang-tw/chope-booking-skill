#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { run, jsonOut, buildWidgetUrl, detectState } = require('./openclaw_browser');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const inputPath = arg('input');
if (!inputPath) {
  jsonOut({ status: 'failed', error: 'missing --input <json-file>' });
  process.exit(2);
}

let req;
try {
  req = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
} catch (err) {
  jsonOut({ status: 'failed', error: `invalid input JSON: ${err.message}` });
  process.exit(2);
}

const { rid, restaurant, date, time, adults = 2, children = 0, availabilityOnly = false } = req;
if (!rid || !restaurant || !date || !time) {
  jsonOut({ status: 'failed', error: 'input must include rid, restaurant, date, time' });
  process.exit(2);
}

try {
  run(['start']);
  const widgetEntry = buildWidgetUrl({ rid, name: restaurant, date, time, adults, children });
  run(['open', widgetEntry]);
  run(['wait', '--ms', '2500']);

  let snapshot = run(['snapshot']);
  let state = detectState(snapshot);

  if (availabilityOnly) {
    jsonOut({ ...state, mode: 'availability_only', request: req, widget_entry: widgetEntry, snapshot_preview: snapshot.slice(0, 4000) });
    process.exit(0);
  }

  // Best-effort fill for common fields. If refs are unstable, operator can continue manually and resume.
  if (req.firstName || req.lastName || req.email || req.mobile || req.specialRequest || req.promoCode) {
    const fillSpec = [];
    if (req.firstName) fillSpec.push({ label: 'First Name', value: req.firstName });
    if (req.lastName) fillSpec.push({ label: 'Last Name', value: req.lastName });
    if (req.email) fillSpec.push({ label: 'Email', value: req.email });
    if (req.mobile) fillSpec.push({ label: 'Mobile', value: req.mobile });
    if (req.specialRequest) fillSpec.push({ label: 'Special requests', value: req.specialRequest });
    if (req.promoCode) fillSpec.push({ label: 'Promo code', value: req.promoCode });

    // This is intentionally conservative: report intended fields and ask agent/operator to apply if refs changed.
    state = {
      status: 'needs_user_input',
      next_action: {
        type: 'form_fill_confirmation',
        prompt: 'Booking form loaded. Fill fields in browser (labels listed), then run chope_resume.js.'
      }
    };

    const out = {
      ...state,
      request: req,
      widget_entry: widgetEntry,
      intended_fields: fillSpec,
      checkpoint_file: path.resolve('./chope_state.json'),
      snapshot_preview: snapshot.slice(0, 4000)
    };

    fs.writeFileSync(path.resolve('./chope_state.json'), JSON.stringify({ request: req, widget_entry: widgetEntry, last_status: state.status }, null, 2));
    jsonOut(out);
    process.exit(0);
  }

  jsonOut({
    ...state,
    request: req,
    widget_entry: widgetEntry,
    checkpoint_file: path.resolve('./chope_state.json'),
    snapshot_preview: snapshot.slice(0, 4000)
  });
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
