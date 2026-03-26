const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWidgetUrl, toChopeDate, toChopeTime } = require('../scripts/openclaw_browser');

// toChopeDate

test('toChopeDate converts YYYY-MM-DD to DD Mon YYYY', () => {
  assert.equal(toChopeDate('2026-03-21'), '21 Mar 2026');
});

test('toChopeDate handles December correctly', () => {
  assert.equal(toChopeDate('2026-12-25'), '25 Dec 2026');
});

test('toChopeDate handles January single-digit day', () => {
  const result = toChopeDate('2026-01-05');
  assert.equal(result, '05 Jan 2026');
});

test('toChopeDate throws on invalid date', () => {
  assert.throws(() => toChopeDate('invalid'), /invalid date/);
});

// toChopeTime

test('toChopeTime converts 24h to 12h pm', () => {
  assert.equal(toChopeTime('19:30'), '7:30 pm');
});

test('toChopeTime converts midnight', () => {
  assert.equal(toChopeTime('00:00'), '12:00 am');
});

test('toChopeTime converts noon', () => {
  assert.equal(toChopeTime('12:00'), '12:00 pm');
});

test('toChopeTime converts morning with leading zero minutes', () => {
  assert.equal(toChopeTime('08:05'), '8:05 am');
});

test('toChopeTime throws on invalid time', () => {
  assert.throws(() => toChopeTime('abc'), /invalid time/);
});

// buildWidgetUrl

test('buildWidgetUrl produces correct URL with expected params', () => {
  const url = buildWidgetUrl({
    rid: 'testrest123sg',
    name: 'Test Restaurant',
    date: '2026-03-21',
    time: '19:30',
    adults: 2,
    children: 0
  });
  assert.ok(url.startsWith('https://book.chope.co/booking/check?'));
  const u = new URL(url);
  assert.equal(u.searchParams.get('rid'), 'testrest123sg');
  assert.equal(u.searchParams.get('name'), 'Test Restaurant');
  assert.equal(u.searchParams.get('adults'), '2');
  assert.equal(u.searchParams.get('children'), '0');
  assert.equal(u.searchParams.get('date'), '21 Mar 2026');
  assert.equal(u.searchParams.get('time'), '7:30 pm');
  assert.equal(u.searchParams.get('lang'), 'en_US');
  assert.equal(u.searchParams.get('country_code'), 'SG');
});
