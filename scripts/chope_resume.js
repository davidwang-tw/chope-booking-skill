#!/usr/bin/env node
const path = require('node:path');
const { run, jsonOut, waitForState } = require('./openclaw_browser');
const { loadSessionState, saveSessionState } = require('./session_state');
const { markFingerprint } = require('./idempotency');
const { correlationId, logEvent, incrementMetric } = require('./observability');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

function buildHandoff({
  state,
  reasonCode,
  checkpointFile,
  sessionId,
  userSummary,
  operatorActions
}) {
  return {
    status: 'handoff_required',
    state,
    reason_code: reasonCode,
    checkpoint_file: checkpointFile || null,
    session_id: sessionId || null,
    user_summary: userSummary,
    operator_actions: operatorActions
  };
}

const statePath = arg('state');
const otp = arg('otp');
const approveDeposit = arg('approve-deposit');
const corr = arg('correlation-id') || correlationId();
const t0 = Date.now();

if (!statePath) {
  logEvent({ correlation_id: corr, step: 'resume.start', status: 'failed', reason_code: 'missing_state' });
  incrementMetric('resume.failed.missing_state');
  jsonOut({ status: 'failed', error: 'missing --state <state-file>', correlation_id: corr });
  process.exit(2);
}

let loaded;
try {
  loaded = loadSessionState(statePath);
} catch (err) {
  logEvent({ correlation_id: corr, step: 'resume.start', status: 'failed', reason_code: 'state_read_error', error: err.message });
  incrementMetric('resume.failed.state_read');
  jsonOut({ status: 'failed', error: `cannot read state file: ${err.message}`, state_file: path.resolve(statePath), correlation_id: corr });
  process.exit(2);
}
const state = loaded.state;

try {
  run(['start']);
  if (state.widget_entry) {
    run(['open', state.widget_entry]);
  }

  const w = waitForState({ attempts: 6, intervalMs: 1500 });
  let snapshot = w.snapshot;
  let detected = w.state;

  if (otp) {
    detected = {
      status: 'needs_user_input',
      next_action: {
        type: 'manual_otp_entry',
        prompt: 'Enter OTP in browser now (auto-typed OTP is intentionally disabled for safety). Then run chope_resume.js again.'
      }
    };
  }

  if (approveDeposit && approveDeposit.toLowerCase() === 'yes') {
    detected = {
      status: 'needs_user_input',
      next_action: {
        type: 'manual_payment_continue',
        prompt: 'Deposit approval confirmed. Continue payment/deposit step in browser, then run chope_resume.js again.'
      }
    };
  }

  const out = {
    ...detected,
    state_file: loaded.state_path,
    correlation_id: corr,
    detection: { attempts_used: w.attempts_used, timed_out: w.timed_out },
    snapshot_preview: snapshot.slice(0, 4000)
  };
  if (detected.status === 'unknown' || detected.status === 'needs_user_input') {
    out.handoff = buildHandoff({
      state: detected.status,
      reasonCode: detected.status === 'unknown' ? 'ambiguous_dom_state' : (detected.next_action?.type || 'manual_step_required'),
      checkpointFile: loaded.state_path,
      sessionId: state.session_id || null,
      userSummary: 'A human review/action is required before we can safely continue this booking.',
      operatorActions: [
        'Inspect the current browser page',
        'Resolve OTP/payment/captcha/manual blocker',
        'Resume booking with the same checkpoint file'
      ]
    });
  }

  saveSessionState(
    {
      ...state,
      last_status: detected.status,
      last_transition: detected.next_action ? detected.next_action.type : detected.status,
      last_evidence: detected.evidence || null
    },
    loaded.state_path
  );

  if (state.idempotency_key) {
    if (detected.status === 'success') {
      markFingerprint(state.idempotency_key, 'confirmed', { session_id: state.session_id || null });
    } else if (detected.status === 'unavailable') {
      markFingerprint(state.idempotency_key, 'unavailable', { session_id: state.session_id || null });
    } else if (detected.status === 'failed') {
      markFingerprint(state.idempotency_key, 'failed', { session_id: state.session_id || null });
    } else {
      markFingerprint(state.idempotency_key, 'in_progress', { session_id: state.session_id || null });
    }
  }

  logEvent({
    correlation_id: corr,
    session_id: state.session_id || null,
    step: 'resume.complete',
    status: out.status,
    reason_code: out.handoff?.reason_code || out.next_action?.type || out.status,
    idempotency_key: state.idempotency_key || null,
    duration_ms: Date.now() - t0
  });
  incrementMetric(`resume.status.${out.status}`);
  if (out.status === 'unknown') incrementMetric('drift.unknown_state');
  jsonOut(out);
} catch (err) {
  logEvent({ correlation_id: corr, step: 'resume.exception', status: 'failed', reason_code: 'runtime_error', error: String(err.message || err), duration_ms: Date.now() - t0 });
  incrementMetric('resume.failed.runtime');
  jsonOut({ status: 'failed', error: String(err.message || err), correlation_id: corr });
  process.exit(1);
}
