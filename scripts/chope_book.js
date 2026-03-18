#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  run,
  jsonOut,
  buildWidgetUrl,
  waitForState,
  validateBookingRequest,
  redactBookingInput,
  userMessageForState
} = require('./openclaw_browser');
const { saveSessionState } = require('./session_state');
const { toFingerprint, checkDuplicate, markFingerprint } = require('./idempotency');
const { correlationId, logEvent, incrementMetric } = require('./observability');
const contactProfiles = require('./contact_profiles');

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

const inputPath = arg('input');
const corr = arg('correlation-id') || correlationId();
const t0 = Date.now();
if (!inputPath) {
  const out = { status: 'failed', error: 'missing --input <json-file>', correlation_id: corr };
  logEvent({ correlation_id: corr, step: 'book.start', status: 'failed', reason_code: 'missing_input' });
  incrementMetric('book.failed.missing_input');
  jsonOut(out);
  process.exit(2);
}

let req;
try {
  req = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
} catch (err) {
  logEvent({ correlation_id: corr, step: 'book.start', status: 'failed', reason_code: 'invalid_json', error: err.message });
  incrementMetric('book.failed.invalid_json');
  jsonOut({ status: 'failed', error: `invalid input JSON: ${err.message}`, correlation_id: corr });
  process.exit(2);
}

const validated = validateBookingRequest(req);
if (!validated.ok) {
  logEvent({ correlation_id: corr, step: 'book.validate', status: 'failed', reason_code: 'input_validation_failed', details: validated.errors });
  incrementMetric('book.failed.validation');
  jsonOut({ status: 'failed', error: 'input validation failed', details: validated.errors, correlation_id: corr });
  process.exit(2);
}
req = validated.normalized;

const userId = req.userId || req.user_id || null;
const requestedProfileId = req.profile_id || null;
const useSavedContact = Boolean(req.use_saved_contact || req.useSavedContact);
let usedProfile = null;
if (userId && (useSavedContact || requestedProfileId)) {
  usedProfile = requestedProfileId ? contactProfiles.getById(userId, requestedProfileId) : contactProfiles.getDefault(userId);
  if (usedProfile) {
    req.firstName = req.firstName || usedProfile.firstName;
    req.lastName = req.lastName || usedProfile.lastName;
    req.email = req.email || usedProfile.email;
    req.mobile = req.mobile || usedProfile.mobile;
  }
}

const idempotencyKey = toFingerprint(req);
const duplicateCheck = checkDuplicate(idempotencyKey);
if (duplicateCheck.duplicate) {
  const out = {
    status: 'needs_user_input',
    next_action: {
      type: 'duplicate_risk',
      prompt: `Duplicate booking risk detected (${duplicateCheck.reason}). Use an explicit operator override policy before retrying this same booking intent.`
    },
    duplicate_check: {
      blocked: true,
      reason: duplicateCheck.reason,
      last_record: duplicateCheck.record ? {
        status: duplicateCheck.record.status,
        session_id: duplicateCheck.record.session_id,
        updated_at: duplicateCheck.record.updated_at
      } : null
    },
    request: redactBookingInput(req),
    user_message: 'I found another booking attempt with the same details and need your confirmation before retrying.',
    correlation_id: corr
  };
  logEvent({
    correlation_id: corr,
    step: 'book.duplicate_check',
    status: 'needs_user_input',
    reason_code: duplicateCheck.reason,
    idempotency_key: idempotencyKey
  });
  incrementMetric(`book.duplicate.${duplicateCheck.reason}`);
  jsonOut(out);
  process.exit(0);
}

const { rid, restaurant, date, time, adults = 2, children = 0, availabilityOnly = false } = req;

try {
  run(['start']);
  const widgetEntry = buildWidgetUrl({ rid, name: restaurant, date, time, adults, children });
  run(['open', widgetEntry]);
  const detected = waitForState({ attempts: 6, intervalMs: 1500 });
  let snapshot = detected.snapshot;
  let state = detected.state;

  if (availabilityOnly) {
    markFingerprint(idempotencyKey, state.status === 'success' ? 'confirmed' : (state.status === 'unavailable' ? 'unavailable' : 'in_progress'), {
      session_id: null,
      mode: 'availability_only'
    });
    const out = {
      ...state,
      mode: 'availability_only',
      request: redactBookingInput(req),
      idempotency_key: idempotencyKey,
      widget_entry: widgetEntry,
      correlation_id: corr,
      detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
      snapshot_preview: snapshot.slice(0, 4000)
    };
    logEvent({
      correlation_id: corr,
      step: 'book.availability_only',
      status: out.status,
      idempotency_key: idempotencyKey,
      duration_ms: Date.now() - t0
    });
    incrementMetric(`book.status.${out.status}`);
    if (out.status === 'unknown') incrementMetric('drift.unknown_state');
    jsonOut(out);
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
      last_transition: state.next_action ? state.next_action.type : state.status,
      idempotency_key: idempotencyKey,
      last_evidence: state.evidence || null
    });
    markFingerprint(idempotencyKey, 'in_progress', { session_id: saved.state.session_id });

    const out = {
      ...state,
      request: redactBookingInput(req),
      idempotency_key: idempotencyKey,
      correlation_id: corr,
      user_message: userMessageForState(state),
      widget_entry: widgetEntry,
      intended_fields: fillSpec,
      checkpoint_file: saved.state_path,
      detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
      snapshot_preview: snapshot.slice(0, 4000)
    };
    if (state.status === 'unknown' || state.status === 'needs_user_input') {
      out.handoff = buildHandoff({
        state: state.status,
        reasonCode: state.status === 'unknown' ? 'ambiguous_dom_state' : (state.next_action?.type || 'manual_step_required'),
        checkpointFile: saved.state_path,
        sessionId: saved.state.session_id,
        userSummary: 'Manual review is required before this booking can continue safely.',
        operatorActions: [
          'Inspect the current browser page state',
          'Confirm restaurant/date/time/party details',
          'Complete required manual step (OTP/payment/captcha) if present',
          'Resume using chope_resume.js with the checkpoint file'
        ]
      });
    }
    logEvent({
      correlation_id: corr,
      session_id: saved.state.session_id,
      step: 'book.form_checkpoint',
      status: out.status,
      reason_code: out.handoff?.reason_code || out.next_action?.type || out.status,
      idempotency_key: idempotencyKey,
      duration_ms: Date.now() - t0
    });
    incrementMetric(`book.status.${out.status}`);
    if (out.status === 'unknown') incrementMetric('drift.unknown_state');
    jsonOut(out);
    process.exit(0);
  }

  const saved = saveSessionState({
    widget_entry: widgetEntry,
    last_status: state.status,
    last_transition: state.next_action ? state.next_action.type : state.status,
    idempotency_key: idempotencyKey,
    last_evidence: state.evidence || null
  });
  markFingerprint(idempotencyKey, state.status === 'success' ? 'confirmed' : (state.status === 'unavailable' ? 'unavailable' : 'in_progress'), {
    session_id: saved.state.session_id
  });

    const out = {
      ...state,
      request: redactBookingInput(req),
      idempotency_key: idempotencyKey,
      correlation_id: corr,
      user_message: userMessageForState(state),
      widget_entry: widgetEntry,
    checkpoint_file: saved.state_path,
    detection: { attempts_used: detected.attempts_used, timed_out: detected.timed_out },
    snapshot_preview: snapshot.slice(0, 4000)
  };
  if (state.status === 'unknown' || state.status === 'needs_user_input') {
    out.handoff = buildHandoff({
      state: state.status,
      reasonCode: state.status === 'unknown' ? 'ambiguous_dom_state' : (state.next_action?.type || 'manual_step_required'),
      checkpointFile: saved.state_path,
      sessionId: saved.state.session_id,
      userSummary: 'Manual review is required before this booking can continue safely.',
      operatorActions: [
        'Inspect current browser page',
        'Confirm booking context and any blockers',
        'Resume booking session'
      ]
    });
  }
  if (userId && req.firstName && req.lastName && req.email && req.mobile) {
    const saved = contactProfiles.saveOrUpdate(userId, {
      profile_id: req.profile_id || undefined,
      firstName: req.firstName,
      lastName: req.lastName,
      email: req.email,
      mobile: req.mobile
    }, true);
    out.contact_profile = {
      used_saved_contact: Boolean(usedProfile),
      saved: true,
      profile_id: saved?.profile_id || null
    };
  } else if (usedProfile) {
    out.contact_profile = {
      used_saved_contact: true,
      saved: false,
      profile_id: usedProfile.profile_id
    };
  }
  logEvent({
    correlation_id: corr,
    session_id: saved.state.session_id,
    step: 'book.complete',
    status: out.status,
    reason_code: out.handoff?.reason_code || out.next_action?.type || out.status,
    idempotency_key: idempotencyKey,
    duration_ms: Date.now() - t0
  });
  incrementMetric(`book.status.${out.status}`);
  if (out.status === 'unknown') incrementMetric('drift.unknown_state');
  jsonOut(out);
} catch (err) {
  logEvent({ correlation_id: corr, step: 'book.exception', status: 'failed', reason_code: 'runtime_error', error: String(err.message || err), duration_ms: Date.now() - t0 });
  incrementMetric('book.failed.runtime');
  jsonOut({ status: 'failed', error: String(err.message || err), correlation_id: corr });
  process.exit(1);
}
