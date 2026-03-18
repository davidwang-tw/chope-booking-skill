#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

function run(args) {
  const p = spawnSync('openclaw', ['browser', ...args], { encoding: 'utf8' });
  if (p.status !== 0) {
    const msg = (p.stderr || p.stdout || '').trim();
    throw new Error(msg || `openclaw browser failed: ${args.join(' ')}`);
  }
  return (p.stdout || '').trim();
}

function jsonOut(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function maskPhone(v) {
  const s = String(v || '').replace(/\s+/g, '');
  if (!s) return '';
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

function redactBookingInput(req = {}) {
  return {
    rid: req.rid,
    restaurant: req.restaurant,
    date: req.date,
    time: req.time,
    adults: req.adults,
    children: req.children,
    availabilityOnly: !!req.availabilityOnly,
    has_contact: Boolean(req.firstName || req.lastName || req.email || req.mobile),
    has_special_request: Boolean(req.specialRequest),
    has_promo_code: Boolean(req.promoCode),
    mobile_hint: req.mobile ? maskPhone(req.mobile) : undefined
  };
}

function validateDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

function validateTime(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
}

function validateEmail(v) {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
}

function validateMobile(v) {
  if (!v) return true;
  return /^[+\d][\d\s-]{5,19}$/.test(String(v));
}

function normalizeInt(v, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  return Number(v);
}

function validateBookingRequest(req = {}) {
  const errors = [];
  if (!req.rid || String(req.rid).trim().length < 2) errors.push('rid must be a non-empty string');
  if (!req.restaurant || String(req.restaurant).trim().length < 2) errors.push('restaurant must be a non-empty string');
  if (!validateDate(req.date)) errors.push('date must be YYYY-MM-DD');
  if (!validateTime(req.time)) errors.push('time must be HH:MM (24h)');

  const adults = normalizeInt(req.adults, 2);
  const children = normalizeInt(req.children, 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) errors.push('adults must be an integer in [1, 30]');
  if (!Number.isInteger(children) || children < 0 || children > 20) errors.push('children must be an integer in [0, 20]');

  if (req.firstName && String(req.firstName).trim().length > 80) errors.push('firstName too long (max 80)');
  if (req.lastName && String(req.lastName).trim().length > 80) errors.push('lastName too long (max 80)');
  if (!validateEmail(req.email)) errors.push('email format is invalid');
  if (!validateMobile(req.mobile)) errors.push('mobile format is invalid');
  if (req.specialRequest && String(req.specialRequest).length > 500) errors.push('specialRequest too long (max 500)');
  if (req.promoCode && String(req.promoCode).length > 64) errors.push('promoCode too long (max 64)');

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...req,
      rid: String(req.rid || '').trim(),
      restaurant: String(req.restaurant || '').trim(),
      date: String(req.date || '').trim(),
      time: String(req.time || '').trim(),
      adults,
      children
    }
  };
}

function toChopeDate(isoDate) {
  // YYYY-MM-DD -> DD Mon YYYY
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${isoDate}`);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

function toChopeTime(hhmm) {
  const [hRaw, mRaw] = String(hhmm).split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`invalid time: ${hhmm}`);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildWidgetUrl({ rid, name, date, time, adults, children = 0, source = 'chope.com.sg' }) {
  const qs = new URLSearchParams({
    date: toChopeDate(date),
    name,
    time: toChopeTime(time),
    adults: String(adults),
    children: String(children),
    rid,
    source,
    redirect: '1',
    lang: 'en_US',
    country_code: 'SG'
  });
  return `https://book.chope.co/booking/check?${qs.toString()}`;
}

function detectState(snapshotText) {
  const t = snapshotText.toLowerCase();

  if (t.includes('verification code') || t.includes('one-time password') || t.includes('otp')) {
    return { status: 'needs_user_input', next_action: { type: 'otp', prompt: 'I need a verification step from you to continue.' } };
  }

  if (t.includes('deposit') || t.includes('pay now') || t.includes('payment')) {
    return {
      status: 'needs_user_input',
      next_action: {
        type: 'payment_approval',
        prompt: 'A payment/deposit confirmation is needed before we continue.'
      }
    };
  }

  if (t.includes('booking confirmed') || t.includes('reservation confirmed') || t.includes('confirmation')) {
    return { status: 'success', next_action: null };
  }

  if (t.includes('no availability') || t.includes('not available') || t.includes('fully booked')) {
    return { status: 'unavailable', next_action: null };
  }

  if (t.includes('captcha') || t.includes('recaptcha')) {
    return {
      status: 'needs_user_input',
      next_action: {
        type: 'manual_browser_intervention',
        prompt: 'I need a quick manual verification step before continuing.'
      }
    };
  }

  return { status: 'in_progress', next_action: null };
}

function userMessageForState(state) {
  if (!state || !state.status) return 'I am checking your booking now.';
  if (state.status === 'success') return 'Your booking is confirmed.';
  if (state.status === 'unavailable') return 'That slot is unavailable. I can check nearby times.';
  if (state.status === 'unknown') return 'I could not safely confirm the booking state yet.';
  if (state.status === 'needs_user_input') {
    const t = state.next_action?.type;
    if (t === 'otp') return 'I need one verification step from you to continue.';
    if (t === 'payment_approval') return 'I need your approval to continue this booking step.';
    if (t === 'manual_browser_intervention') return 'I need a quick manual step to continue.';
    return 'I need one more step from you to continue.';
  }
  if (state.status === 'failed') return 'I could not complete this booking attempt.';
  return 'I am still working on your booking.';
}

function parseEvaluateOutput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // Some environments return prefixed text; try to find JSON tail.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (_) {
        return trimmed;
      }
    }
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    return trimmed;
  }
}

function browserEvaluate(fn) {
  const out = run(['evaluate', '--fn', fn]);
  return parseEvaluateOutput(out);
}

function getDomMarkers() {
  const fn = `() => {
    const has = (sel) => !!document.querySelector(sel);
    const text = (document.body?.innerText || '').toLowerCase();
    const url = location.href;
    const refTextMatch = /(booking|reservation)\\s*(ref|reference|id)\\s*[:#]?\\s*[a-z0-9-]{4,}/i.test(text);
    return {
      url,
      has_otp_input: has('input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i]'),
      has_payment_marker: has('[class*="deposit" i], [class*="payment" i], button, [role="button"]') && /deposit|payment|pay now/i.test(text),
      has_success_marker: has('[class*="confirm" i], [id*="confirm" i], [data-testid*="confirm" i]') || /booking confirmed|reservation confirmed/.test(text),
      has_booking_reference: refTextMatch,
      has_final_confirmation_url: /confirm|confirmation|success|complete|thank-you|thankyou/i.test(url),
      has_unavailable_marker: has('[class*="unavailable" i], [class*="fully" i], [data-testid*="unavailable" i]') || /no availability|fully booked|not available/.test(text),
      has_captcha_marker: has('iframe[src*="recaptcha"], [id*="captcha" i], [class*="captcha" i]') || /captcha|recaptcha/.test(text)
    };
  }`;
  try {
    const parsed = browserEvaluate(fn);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch (_) {
    return null;
  }
}

function detectStateDomFirst(snapshotText) {
  const textState = detectState(snapshotText);
  const dom = getDomMarkers();
  if (!dom) return textState;

  if (dom.has_captcha_marker) {
    return {
      status: 'needs_user_input',
      next_action: {
        type: 'manual_browser_intervention',
        prompt: 'Captcha detected. Please solve in attached browser, then resume.'
      },
      evidence: { source: 'dom', dom }
    };
  }

  if (dom.has_otp_input) {
    return {
      status: 'needs_user_input',
      next_action: { type: 'otp', prompt: 'Enter the OTP sent to your phone.' },
      evidence: { source: 'dom', dom }
    };
  }

  if (dom.has_payment_marker) {
    return {
      status: 'needs_user_input',
      next_action: {
        type: 'payment_approval',
        prompt: 'Deposit/payment step detected. Confirm if you want to continue.'
      },
      evidence: { source: 'dom', dom }
    };
  }

  const successSignals = [dom.has_success_marker, dom.has_booking_reference, dom.has_final_confirmation_url].filter(Boolean).length;
  if (successSignals >= 2) {
    return {
      status: 'success',
      next_action: null,
      evidence: { source: 'dom', dom, success_signals: successSignals }
    };
  }

  if (dom.has_unavailable_marker && !dom.has_success_marker) {
    return { status: 'unavailable', next_action: null, evidence: { source: 'dom', dom } };
  }

  // Ambiguous DOM/text mismatch should not be treated as successful booking.
  if (textState.status === 'success' && !(dom.has_success_marker || dom.has_booking_reference)) {
    return {
      status: 'unknown',
      next_action: {
        type: 'manual_review',
        prompt: 'Ambiguous confirmation state. Review page manually, then resume.'
      },
      evidence: { source: 'dom_text_mismatch', dom, text_state: textState }
    };
  }

  if (textState.status === 'unavailable' && !dom.has_unavailable_marker) {
    return {
      status: 'unknown',
      next_action: {
        type: 'manual_review',
        prompt: 'Ambiguous availability state. Review page manually, then resume.'
      },
      evidence: { source: 'dom_text_mismatch', dom, text_state: textState }
    };
  }

  if (textState.status === 'in_progress') {
    return { status: 'unknown', next_action: null, evidence: { source: 'dom', dom } };
  }

  return { ...textState, evidence: { source: 'text_fallback', dom } };
}

function waitForState({
  attempts = 5,
  intervalMs = 1500,
  terminalStatuses = ['success', 'unavailable', 'needs_user_input', 'unknown'],
  allowInProgressFinal = true
} = {}) {
  let lastSnapshot = '';
  let lastState = { status: 'unknown', next_action: null };

  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) run(['wait', '--ms', String(intervalMs)]);
    const snapshot = run(['snapshot']);
    const state = detectStateDomFirst(snapshot);
    lastSnapshot = snapshot;
    lastState = state;
    if (terminalStatuses.includes(state.status)) {
      return { snapshot, state, attempts_used: i + 1, timed_out: false };
    }
  }

  if (allowInProgressFinal) {
    return { snapshot: lastSnapshot, state: lastState, attempts_used: attempts, timed_out: true };
  }
  throw new Error('state detection timed out without terminal status');
}

module.exports = {
  run,
  jsonOut,
  buildWidgetUrl,
  detectState,
  detectStateDomFirst,
  waitForState,
  browserEvaluate,
  validateBookingRequest,
  redactBookingInput,
  userMessageForState
};
