const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chope-session-test-'));
process.env.CHOPE_STATE_DIR = path.join(tempRoot, 'state');

const { saveSessionState, loadSessionState, cleanupExpiredSessions, stateDir } = require('../scripts/session_state');

test('saveSessionState creates a JSON file with expected fields', () => {
  const result = saveSessionState({
    widget_entry: 'https://book.chope.co/booking/check?test=1',
    last_status: 'in_progress',
    last_transition: null,
    idempotency_key: 'abc123'
  });

  assert.ok(result.state_path);
  assert.ok(fs.existsSync(result.state_path));
  assert.ok(result.state.session_id);
  assert.equal(result.state.widget_entry, 'https://book.chope.co/booking/check?test=1');
  assert.equal(result.state.last_status, 'in_progress');
  assert.equal(result.state.idempotency_key, 'abc123');
  assert.ok(result.state.created_at);
  assert.ok(result.state.updated_at);
});

test('saveSessionState with existingPath writes to that path', () => {
  const customPath = path.join(stateDir(), 'custom-session.json');
  const result = saveSessionState({
    widget_entry: 'https://example.com',
    last_status: 'success'
  }, customPath);

  assert.equal(result.state_path, customPath);
  assert.ok(fs.existsSync(customPath));
});

test('loadSessionState round-trips saved state', () => {
  const saved = saveSessionState({
    widget_entry: 'https://example.com/roundtrip',
    last_status: 'needs_user_input',
    idempotency_key: 'roundtrip-key'
  });

  const loaded = loadSessionState(saved.state_path);
  assert.equal(loaded.state.session_id, saved.state.session_id);
  assert.equal(loaded.state.widget_entry, 'https://example.com/roundtrip');
  assert.equal(loaded.state.last_status, 'needs_user_input');
  assert.equal(loaded.state.idempotency_key, 'roundtrip-key');
});

test('loadSessionState throws on missing file', () => {
  assert.throws(() => loadSessionState('/tmp/nonexistent-session-file.json'));
});

test('cleanupExpiredSessions removes old files and keeps fresh ones', () => {
  const dir = stateDir();
  const oldFile = path.join(dir, 'old-session.json');
  const freshFile = path.join(dir, 'fresh-session.json');

  fs.writeFileSync(oldFile, '{}', { mode: 0o600 });
  fs.writeFileSync(freshFile, '{}', { mode: 0o600 });

  // Set old file mtime to 48h ago
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, past, past);

  cleanupExpiredSessions(dir);

  assert.equal(fs.existsSync(oldFile), false, 'expired session should be deleted');
  assert.equal(fs.existsSync(freshFile), true, 'fresh session should survive');
});
