#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  run,
  jsonOut,
  buildWidgetUrl,
  waitForState,
  validateBookingRequest,
  redactBookingInput
} = require('./openclaw_browser');
const { saveSessionState } = require('./session_state');

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

const validated = validateBookingRequest(req);
if (!validated.ok) {
  jsonOut({ status: 'failed', error: 'input validation failed', details: validated.errors });
  process.exit(2);
}
req = validated.normalized;

const { rid, restaurant, date, time, adults = 2, children = 0, availabilityOnly = false } = req;

try {
  run(['start']);
  const widgetEntry = buildWidgetUrl({ rid, name: restaurant, date, time, adults, children });
  run(['open', widgetEntry]);
  const detected = waitForState({ attempts: 6, intervalMs: 1500 });
  let snapshot = detected.snapshot;
  let state = detected.state;

  if (availabilityOnly) {
    jsonOut({
      ...state,
      mode: 'availability_only',
      request: redactBookingInput(req),
      widget_entry: widgetEntry,
      detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
      snapshot_preview: snapshot.slice(0, 4000)
    });
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

    const saved = saveSessionState({
      widget_entry: widgetEntry,
      last_status: state.status,
      last_transition: state.next_action ? state.next_action.type : state.status
    });

    const out = {
      ...state,
      request: redactBookingInput(req),
      widget_entry: widgetEntry,
      intended_fields: fillSpec,
      checkpoint_file: saved.state_path,
      detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
      snapshot_preview: snapshot.slice(0, 4000)
    };
    jsonOut(out);
    process.exit(0);
  }

  const saved = saveSessionState({
    widget_entry: widgetEntry,
    last_status: state.status,
    last_transition: state.next_action ? state.next_action.type : state.status
  });

  jsonOut({
    ...state,
    request: redactBookingInput(req),
    widget_entry: widgetEntry,
    checkpoint_file: saved.state_path,
    detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
    snapshot_preview: snapshot.slice(0, 4000)
  });
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
