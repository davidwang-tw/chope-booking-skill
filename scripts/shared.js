#!/usr/bin/env node

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

module.exports = { arg, buildHandoff };
