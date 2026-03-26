const test = require('node:test');
const assert = require('node:assert/strict');
const { detectStateDomFirst } = require('../scripts/openclaw_browser');

function emptyDom(overrides = {}) {
  return {
    url: 'https://booking.chope.co/widget/#/booking_check',
    has_otp_input: false,
    has_payment_marker: false,
    has_success_marker: false,
    has_booking_reference: false,
    has_final_confirmation_url: false,
    has_unavailable_marker: false,
    has_captcha_marker: false,
    ...overrides
  };
}

// Fallback when DOM is null

test('falls back to text detection when DOM is null', () => {
  const result = detectStateDomFirst('Please enter OTP verification code', null);
  assert.equal(result.status, 'needs_user_input');
  assert.equal(result.next_action.type, 'otp');
});

// Captcha detection

test('captcha detected via DOM takes priority', () => {
  const dom = emptyDom({ has_captcha_marker: true, has_otp_input: true });
  const result = detectStateDomFirst('some page text', dom);
  assert.equal(result.status, 'needs_user_input');
  assert.equal(result.next_action.type, 'manual_browser_intervention');
  assert.equal(result.evidence.source, 'dom');
});

// OTP detection

test('OTP detected via DOM', () => {
  const dom = emptyDom({ has_otp_input: true });
  const result = detectStateDomFirst('some page text', dom);
  assert.equal(result.status, 'needs_user_input');
  assert.equal(result.next_action.type, 'otp');
});

// Payment detection

test('payment detected via DOM', () => {
  const dom = emptyDom({ has_payment_marker: true });
  const result = detectStateDomFirst('some page text', dom);
  assert.equal(result.status, 'needs_user_input');
  assert.equal(result.next_action.type, 'payment_approval');
});

// Success requires 2+ signals

test('success with 2 DOM signals', () => {
  const dom = emptyDom({ has_success_marker: true, has_booking_reference: true });
  const result = detectStateDomFirst('Booking confirmed', dom);
  assert.equal(result.status, 'success');
  assert.equal(result.evidence.success_signals, 2);
});

test('success with 3 DOM signals', () => {
  const dom = emptyDom({
    has_success_marker: true,
    has_booking_reference: true,
    has_final_confirmation_url: true
  });
  const result = detectStateDomFirst('Booking confirmed', dom);
  assert.equal(result.status, 'success');
  assert.equal(result.evidence.success_signals, 3);
});

// Text says confirmed but DOM disagrees -> unknown

test('text confirmation without DOM support returns unknown', () => {
  const dom = emptyDom();
  const result = detectStateDomFirst('Booking confirmed successfully', dom);
  assert.equal(result.status, 'unknown');
  assert.equal(result.evidence.source, 'dom_text_mismatch');
});

// Unavailable detection

test('unavailable with DOM marker', () => {
  const dom = emptyDom({ has_unavailable_marker: true });
  const result = detectStateDomFirst('No availability', dom);
  assert.equal(result.status, 'unavailable');
});

// Text says unavailable but DOM disagrees -> unknown

test('text unavailable without DOM support returns unknown', () => {
  const dom = emptyDom();
  const result = detectStateDomFirst('No availability for this date', dom);
  assert.equal(result.status, 'unknown');
  assert.equal(result.evidence.source, 'dom_text_mismatch');
});

// In-progress fallback -> unknown with DOM

test('in-progress text with no DOM markers returns unknown', () => {
  const dom = emptyDom();
  const result = detectStateDomFirst('Loading restaurant widget...', dom);
  assert.equal(result.status, 'unknown');
  assert.equal(result.evidence.source, 'dom');
});

// Priority: captcha > OTP > payment

test('captcha takes priority over OTP and payment', () => {
  const dom = emptyDom({ has_captcha_marker: true, has_otp_input: true, has_payment_marker: true });
  const result = detectStateDomFirst('page text', dom);
  assert.equal(result.next_action.type, 'manual_browser_intervention');
});

test('OTP takes priority over payment', () => {
  const dom = emptyDom({ has_otp_input: true, has_payment_marker: true });
  const result = detectStateDomFirst('page text', dom);
  assert.equal(result.next_action.type, 'otp');
});
