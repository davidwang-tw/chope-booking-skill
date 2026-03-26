const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chope-obs-test-'));
process.env.CHOPE_LOG_DIR = path.join(tempRoot, 'logs');

const { correlationId, logEvent, incrementMetric, readMetrics, redact } = require('../scripts/observability');

// correlationId

test('correlationId returns a UUID-shaped string', () => {
  const id = correlationId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('correlationId returns unique values', () => {
  const a = correlationId();
  const b = correlationId();
  assert.notEqual(a, b);
});

// redact

test('redact masks email', () => {
  const result = redact({ email: 'alice@example.com' });
  assert.ok(result.email.includes('***'));
  assert.ok(result.email.includes('@'));
  assert.ok(!result.email.includes('alice'));
});

test('redact masks mobile', () => {
  const result = redact({ mobile: '+6591234567' });
  assert.ok(result.mobile.endsWith('4567'));
  assert.ok(result.mobile.includes('*'));
});

test('redact masks firstName and lastName', () => {
  const result = redact({ firstName: 'Alice', lastName: 'Tan' });
  assert.equal(result.firstName, 'A***');
  assert.equal(result.lastName, 'T***');
});

test('redact masks OTP', () => {
  const result = redact({ otp: '123456' });
  assert.equal(result.otp, '***');
});

test('redact passes through non-sensitive fields', () => {
  const result = redact({ rid: 'test123', date: '2026-03-21' });
  assert.equal(result.rid, 'test123');
  assert.equal(result.date, '2026-03-21');
});

test('redact handles nested objects', () => {
  const result = redact({ contact: { email: 'bob@example.com', phone: '+6599998888' } });
  assert.ok(result.contact.email.includes('***'));
  assert.ok(result.contact.phone.includes('*'));
});

// logEvent

test('logEvent appends JSON lines to events.log', () => {
  logEvent({ correlation_id: 'test-1', step: 'test.first' });
  logEvent({ correlation_id: 'test-2', step: 'test.second' });

  const logFile = path.join(process.env.CHOPE_LOG_DIR, 'events.log');
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);

  const first = JSON.parse(lines[0]);
  assert.ok(first.ts);
  assert.equal(first.correlation_id, 'test-1');
  assert.equal(first.step, 'test.first');

  const second = JSON.parse(lines[1]);
  assert.equal(second.correlation_id, 'test-2');
});

// incrementMetric

test('incrementMetric creates and increments counters (append-only)', () => {
  incrementMetric('test.counter');
  incrementMetric('test.counter');
  incrementMetric('test.other', 5);

  const m = readMetrics();
  assert.equal(m['test.counter'], 2);
  assert.equal(m['test.other'], 5);
});
