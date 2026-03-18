const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chope-idem-test-'));
process.env.CHOPE_STATE_DIR = path.join(tempRoot, 'state');

const { toFingerprint, checkDuplicate, markFingerprint } = require('../scripts/idempotency');

test('fingerprint stable for equivalent normalized input', () => {
  const a = toFingerprint({
    rid: 'r1',
    date: '2026-03-20',
    time: '19:30',
    adults: 2,
    children: 0,
    email: 'A@EXAMPLE.COM',
    mobile: '+65 9123 4567',
    firstName: 'Alice',
    lastName: 'Tan'
  });
  const b = toFingerprint({
    rid: 'r1',
    date: '2026-03-20',
    time: '19:30',
    adults: 2,
    children: 0,
    email: 'a@example.com',
    mobile: '+6591234567',
    firstName: 'alice',
    lastName: 'tan'
  });
  assert.equal(a, b);
});

test('duplicate detection blocks confirmed and active in_progress', () => {
  const fp = toFingerprint({
    rid: 'r2',
    date: '2026-03-21',
    time: '20:00',
    adults: 2,
    children: 0,
    email: 'u@example.com'
  });

  assert.equal(checkDuplicate(fp).duplicate, false);
  markFingerprint(fp, 'in_progress', { session_id: 's1' });
  assert.equal(checkDuplicate(fp).duplicate, true);

  markFingerprint(fp, 'confirmed', { session_id: 's1' });
  const d = checkDuplicate(fp);
  assert.equal(d.duplicate, true);
  assert.equal(d.reason, 'already_confirmed');
});
