#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stateDir } = require('./session_state');

const FILE = 'contact-profiles.json';
const DEFAULT_TTL_DAYS = Number(process.env.CHOPE_CONTACT_PROFILE_TTL_DAYS || 180);
const LOCK_TIMEOUT_MS = 3000;
const LOCK_RETRY_MS = 50;

function filePath() {
  return path.join(stateDir(), FILE);
}

function lockPath() {
  return filePath() + '.lock';
}

function ensureStore() {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
}

function acquireLock() {
  ensureStore();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath(), fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const st = fs.statSync(lockPath());
          if (Date.now() - st.mtimeMs > LOCK_TIMEOUT_MS) {
            fs.unlinkSync(lockPath());
            continue;
          }
        } catch (_) { /* lock removed by other process */ }
        const start = Date.now();
        while (Date.now() - start < LOCK_RETRY_MS) { /* spin */ }
        continue;
      }
      throw err;
    }
  }
  throw new Error('contact_profiles: lock acquisition timed out');
}

function releaseLock() {
  try { fs.unlinkSync(lockPath()); } catch (_) { /* already released */ }
}

function readStoreUnsafe() {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.users) return { users: {} };
    return raw;
  } catch (_) {
    return { users: {} };
  }
}

function writeStoreUnsafe(store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.chmodSync(filePath(), 0o600);
}

function withStore(fn, { readOnly = false } = {}) {
  acquireLock();
  try {
    const store = cleanupExpired(readStoreUnsafe());
    const result = fn(store);
    if (!readOnly) writeStoreUnsafe(store);
    return result;
  } finally {
    releaseLock();
  }
}

function userKey(userId) {
  return crypto.createHash('sha256').update(String(userId || '')).digest('hex').slice(0, 24);
}

function profileIdFrom(profile) {
  const base = `${profile.email || ''}|${profile.mobile || ''}|${profile.firstName || ''}|${profile.lastName || ''}`;
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
}

function list(userId) {
  return withStore((s) => {
    const k = userKey(userId);
    const bucket = s.users[k] || { profiles: [], default_profile_id: null };
    return bucket.profiles || [];
  }, { readOnly: true });
}

function getDefault(userId) {
  return withStore((s) => {
    const k = userKey(userId);
    const bucket = s.users[k];
    if (!bucket || !Array.isArray(bucket.profiles)) return null;
    return bucket.profiles.find((p) => p.profile_id === bucket.default_profile_id) || bucket.profiles[0] || null;
  }, { readOnly: true });
}

function getById(userId, profileId) {
  const profiles = list(userId);
  return profiles.find((p) => p.profile_id === profileId) || null;
}

function saveOrUpdate(userId, profile, setDefault = true) {
  const profileId = profile.profile_id || profileIdFrom(profile);
  return withStore((s) => {
    const k = userKey(userId);
    const bucket = s.users[k] || { profiles: [], default_profile_id: null };
    const clean = {
      profile_id: profileId,
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email || '',
      mobile: profile.mobile || '',
      updated_at: new Date().toISOString()
    };
    const i = bucket.profiles.findIndex((p) => p.profile_id === profileId);
    if (i >= 0) bucket.profiles[i] = { ...bucket.profiles[i], ...clean };
    else bucket.profiles.push({ ...clean, created_at: clean.updated_at });
    if (setDefault || !bucket.default_profile_id) bucket.default_profile_id = profileId;
    s.users[k] = bucket;
    return bucket.profiles.find((p) => p.profile_id === profileId) || null;
  });
}

function remove(userId, profileId) {
  return withStore((s) => {
    const k = userKey(userId);
    const bucket = s.users[k];
    if (!bucket) return false;
    const before = bucket.profiles.length;
    bucket.profiles = bucket.profiles.filter((p) => p.profile_id !== profileId);
    if (bucket.default_profile_id === profileId) {
      bucket.default_profile_id = bucket.profiles[0]?.profile_id || null;
    }
    s.users[k] = bucket;
    return bucket.profiles.length !== before;
  });
}

function removeAll(userId) {
  return withStore((s) => {
    const k = userKey(userId);
    if (!s.users[k]) return false;
    delete s.users[k];
    return true;
  });
}

function setDefault(userId, profileId) {
  return withStore((s) => {
    const k = userKey(userId);
    const bucket = s.users[k];
    if (!bucket || !bucket.profiles.find((p) => p.profile_id === profileId)) return false;
    bucket.default_profile_id = profileId;
    s.users[k] = bucket;
    return true;
  });
}

function cleanupExpired(store) {
  const now = Date.now();
  const ttlMs = DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
  const out = store || { users: {} };
  for (const [k, bucket] of Object.entries(out.users || {})) {
    const profiles = (bucket.profiles || []).filter((p) => {
      const updated = new Date(p.updated_at || p.created_at || 0).getTime();
      return Number.isFinite(updated) && (now - updated) <= ttlMs;
    });
    if (profiles.length === 0) {
      delete out.users[k];
      continue;
    }
    bucket.profiles = profiles;
    if (!profiles.find((p) => p.profile_id === bucket.default_profile_id)) {
      bucket.default_profile_id = profiles[0].profile_id;
    }
    out.users[k] = bucket;
  }
  return out;
}

module.exports = {
  list,
  getDefault,
  getById,
  saveOrUpdate,
  remove,
  removeAll,
  setDefault,
  DEFAULT_TTL_DAYS
};
