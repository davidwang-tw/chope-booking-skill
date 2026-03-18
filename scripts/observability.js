#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function logDir() {
  return process.env.CHOPE_LOG_DIR || path.join(os.tmpdir(), 'chope-booking-logs');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true, mode: 0o700 });
}

function correlationId() {
  return crypto.randomUUID();
}

function redactValue(key, value) {
  if (value == null) return value;
  const k = String(key || '').toLowerCase();
  const v = String(value);
  if (k.includes('email')) return v.replace(/(^.).*(@.*$)/, '$1***$2');
  if (k.includes('mobile') || k.includes('phone')) return v.length > 4 ? `${'*'.repeat(v.length - 4)}${v.slice(-4)}` : '****';
  if (k.includes('first') || k.includes('last') || k === 'name') return v ? `${v[0]}***` : v;
  if (k.includes('otp')) return '***';
  return value;
}

function redact(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((x) => redact(x));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') out[k] = redact(v);
    else out[k] = redactValue(k, v);
  }
  return out;
}

function appendJsonLine(filename, payload) {
  const dir = logDir();
  ensureDir(dir);
  const file = path.join(dir, filename);
  fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function logEvent(event) {
  const payload = {
    ts: new Date().toISOString(),
    ...redact(event)
  };
  appendJsonLine('events.log', payload);
}

function incrementMetric(metric, value = 1) {
  const dir = logDir();
  ensureDir(dir);
  const p = path.join(dir, 'metrics.json');
  let m = {};
  try {
    m = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    m = {};
  }
  m[metric] = (Number(m[metric]) || 0) + value;
  fs.writeFileSync(p, JSON.stringify(m, null, 2), { mode: 0o600 });
  fs.chmodSync(p, 0o600);
}

module.exports = {
  correlationId,
  logEvent,
  incrementMetric,
  redact
};
