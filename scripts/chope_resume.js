#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { run, jsonOut, detectState } = require('./openclaw_browser');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const statePath = arg('state', './chope_state.json');
const otp = arg('otp');
const approveDeposit = arg('approve-deposit');

let state;
try {
  state = JSON.parse(fs.readFileSync(path.resolve(statePath), 'utf8'));
} catch (err) {
  jsonOut({ status: 'failed', error: `cannot read state file: ${err.message}` });
  process.exit(2);
}

try {
  run(['start']);
  if (state.widget_entry) {
    run(['open', state.widget_entry]);
    run(['wait', '--ms', '1800']);
  }

  let snapshot = run(['snapshot']);
  let detected = detectState(snapshot);

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
    state_file: path.resolve(statePath),
    snapshot_preview: snapshot.slice(0, 4000)
  };

  fs.writeFileSync(path.resolve(statePath), JSON.stringify({ ...state, last_status: detected.status, updated_at: new Date().toISOString() }, null, 2));
  jsonOut(out);
} catch (err) {
  jsonOut({ status: 'failed', error: String(err.message || err) });
  process.exit(1);
}
