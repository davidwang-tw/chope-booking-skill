#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function stateDir() {
  return process.env.CHOPE_STATE_DIR || path.join(os.tmpdir(), 'chope-booking-sessions');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true, mode: 0o700 });
}

function cleanupExpiredSessions(dir = stateDir(), ttlMs = DEFAULT_TTL_MS) {
  ensureDir(dir);
  const now = Date.now();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs > ttlMs) fs.unlinkSync(p);
    } catch (_) {
      // best-effort cleanup
    }
  }
}

function saveSessionState(payload, existingPath = null) {
  const dir = stateDir();
  cleanupExpiredSessions(dir);
  ensureDir(dir);

  const sessionId = payload.session_id || crypto.randomUUID();
  const out = {
    session_id: sessionId,
    widget_entry: payload.widget_entry || '',
    idempotency_key: payload.idempotency_key || '',
    last_status: payload.last_status || 'in_progress',
    last_evidence: payload.last_evidence || null,
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_transition: payload.last_transition || null
  };

  const p = existingPath ? path.resolve(existingPath) : path.join(dir, `${sessionId}.json`);
  fs.writeFileSync(p, JSON.stringify(out, null, 2), { mode: 0o600 });
  fs.chmodSync(p, 0o600);
  return { state_path: p, state: out };
}

function loadSessionState(statePath) {
  cleanupExpiredSessions();
  const p = path.resolve(statePath);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    state_path: p,
    state: raw
  };
}

module.exports = {
  saveSessionState,
  loadSessionState,
  cleanupExpiredSessions,
  stateDir
};
