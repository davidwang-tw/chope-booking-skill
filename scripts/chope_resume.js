#!/usr/bin/env node
const path = require('node:path');
const { run, jsonOut, waitForState } = require('./openclaw_browser');
const { loadSessionState, saveSessionState } = require('./session_state');
const { markFingerprint } = require('./idempotency');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const statePath = arg('state');
const otp = arg('otp');
const approveDeposit = arg('approve-deposit');

if (!statePath) {
  jsonOut({ status: 'failed', error: 'missing --state <state-file>' });
  process.exit(2);
}

let loaded;
try {
  loaded = loadSessionState(statePath);
} catch (err) {
  jsonOut({ status: 'failed', error: `cannot read state file: ${err.message}`, state_file: path.resolve(statePath) });
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
    detection: { attempts_used: w.attempts_used, timed_out: w.timed_out },
    snapshot_preview: snapshot.slice(0, 4000)
  };

  saveSessionState(
    {
      ...state,
      last_status: detected.status,
      last_transition: detected.next_action ? detected.next_action.type : detected.status
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

  jsonOut(out);
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
