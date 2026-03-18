const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBookingRequest, detectState } = require('../scripts/openclaw_browser');

test('validateBookingRequest accepts valid payload', () => {
  const v = validateBookingRequest({
    rid: 'abc123',
    restaurant: 'Demo Bistro',
    date: '2026-04-01',
    time: '19:30',
    adults: 2,
    children: 0,
    email: 'user@example.com',
    mobile: '+6591234567'
  });
  assert.equal(v.ok, true);
  assert.equal(v.errors.length, 0);
});

test('validateBookingRequest rejects malformed payload', () => {
  const v = validateBookingRequest({
    rid: '',
    restaurant: 'x',
    date: '01-04-2026',
    time: '7:30pm',
    adults: 0,
    children: -1,
    email: 'bad',
    mobile: 'abc'
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 4);
});

test('detectState basic text routing', () => {
  assert.equal(detectState('Please enter OTP verification code').status, 'needs_user_input');
  assert.equal(detectState('No availability for selected time').status, 'unavailable');
  assert.equal(detectState('Booking confirmed. Reservation confirmed').status, 'success');
});
