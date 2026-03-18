#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stateDir } = require('./session_state');

const FILE = 'contact-profiles.json';

function filePath() {
  return path.join(stateDir(), FILE);
}

function ensureStore() {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.users) return { users: {} };
    return raw;
  } catch (_) {
    return { users: {} };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.chmodSync(filePath(), 0o600);
}

function userKey(userId) {
  return crypto.createHash('sha256').update(String(userId || '')).digest('hex').slice(0, 24);
}

function profileIdFrom(profile) {
  const base = `${profile.email || ''}|${profile.mobile || ''}|${profile.firstName || ''}|${profile.lastName || ''}`;
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
}

function list(userId) {
  const s = readStore();
  const k = userKey(userId);
  const bucket = s.users[k] || { profiles: [], default_profile_id: null };
  return bucket.profiles || [];
}

function getDefault(userId) {
  const s = readStore();
  const k = userKey(userId);
  const bucket = s.users[k];
  if (!bucket || !Array.isArray(bucket.profiles)) return null;
  return bucket.profiles.find((p) => p.profile_id === bucket.default_profile_id) || bucket.profiles[0] || null;
}

function getById(userId, profileId) {
  const profiles = list(userId);
  return profiles.find((p) => p.profile_id === profileId) || null;
}

function saveOrUpdate(userId, profile, setDefault = true) {
  const s = readStore();
  const k = userKey(userId);
  const bucket = s.users[k] || { profiles: [], default_profile_id: null };
  const profileId = profile.profile_id || profileIdFrom(profile);
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
  writeStore(s);
  return getById(userId, profileId);
}

function remove(userId, profileId) {
  const s = readStore();
  const k = userKey(userId);
  const bucket = s.users[k];
  if (!bucket) return false;
  const before = bucket.profiles.length;
  bucket.profiles = bucket.profiles.filter((p) => p.profile_id !== profileId);
  if (bucket.default_profile_id === profileId) {
    bucket.default_profile_id = bucket.profiles[0]?.profile_id || null;
  }
  s.users[k] = bucket;
  writeStore(s);
  return bucket.profiles.length !== before;
}

module.exports = {
  list,
  getDefault,
  getById,
  saveOrUpdate,
  remove
};
