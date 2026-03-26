#!/usr/bin/env node
const { run, jsonOut, buildWidgetUrl, waitForState, validateBookingRequest, redactBookingInput, SNAPSHOT_PREVIEW_LIMIT } = require('./openclaw_browser');
const { correlationId, logEvent, incrementMetric } = require('./observability');
const { arg } = require('./shared');

const rid = arg('rid');
const name = arg('name');
const date = arg('date');
const time = arg('time');
const adults = Number(arg('adults', '2'));
const children = Number(arg('children', '0'));
const corr = arg('correlation-id') || correlationId();
const t0 = Date.now();

const validated = validateBookingRequest({
  rid,
  restaurant: name,
  date,
  time,
  adults,
  children
});
if (!validated.ok) {
  logEvent({ correlation_id: corr, step: 'availability.validate', status: 'failed', reason_code: 'input_validation_failed', details: validated.errors });
  incrementMetric('availability.failed.validation');
  jsonOut({ status: 'failed', error: 'input validation failed', details: validated.errors, correlation_id: corr });
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

  logEvent({
    correlation_id: corr,
    step: 'availability.complete',
    status: state.status,
    duration_ms: Date.now() - t0
  });
  incrementMetric(`availability.status.${state.status}`);

  jsonOut({
    ...state,
    correlation_id: corr,
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
    snapshot_preview: snapshot.slice(0, SNAPSHOT_PREVIEW_LIMIT)
  });
} catch (err) {
  logEvent({ correlation_id: corr, step: 'availability.exception', status: 'failed', reason_code: 'runtime_error', error: String(err.message || err), duration_ms: Date.now() - t0 });
  incrementMetric('availability.failed.runtime');
  jsonOut({ status: 'failed', error: String(err.message || err), correlation_id: corr });
  process.exit(1);
}
