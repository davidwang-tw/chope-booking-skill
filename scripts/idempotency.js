#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stateDir } = require('./session_state');

const LEDGER_FILE = 'idempotency-ledger.json';
const IN_PROGRESS_TTL_MS = 60 * 60 * 1000;

function ledgerPath() {
  return path.join(stateDir(), LEDGER_FILE);
}

function readLedger() {
  try {
    const raw = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.items || typeof raw.items !== 'object') {
      return { items: {} };
    }
    return raw;
  } catch (_) {
    return { items: {} };
  }
}

function writeLedger(ledger) {
  const p = ledgerPath();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, JSON.stringify(ledger, null, 2), { mode: 0o600 });
  fs.chmodSync(p, 0o600);
}

function toFingerprint(req = {}) {
  const base = {
    rid: String(req.rid || ''),
    date: String(req.date || ''),
    time: String(req.time || ''),
    adults: Number(req.adults || 0),
    children: Number(req.children || 0)
  };

  const contactMaterial = [
    String(req.email || '').trim().toLowerCase(),
    String(req.mobile || '').replace(/\s+/g, ''),
    String(req.firstName || '').trim().toLowerCase(),
    String(req.lastName || '').trim().toLowerCase()
  ].join('|');

  const contactHash = crypto.createHash('sha256').update(contactMaterial).digest('hex').slice(0, 24);
  const material = JSON.stringify({ ...base, contact_hash: contactHash });
  return crypto.createHash('sha256').update(material).digest('hex');
}

function checkDuplicate(fingerprint) {
  const ledger = readLedger();
  const rec = ledger.items[fingerprint];
  if (!rec) return { duplicate: false, reason: null };

  if (rec.status === 'confirmed') {
    return { duplicate: true, reason: 'already_confirmed', record: rec };
  }

  if (rec.status === 'in_progress') {
    const age = Date.now() - new Date(rec.updated_at || rec.created_at || 0).getTime();
    if (Number.isFinite(age) && age < IN_PROGRESS_TTL_MS) {
      return { duplicate: true, reason: 'already_in_progress', record: rec };
    }
  }

  return { duplicate: false, reason: null, record: rec };
}

function markFingerprint(fingerprint, status, attrs = {}) {
  const ledger = readLedger();
  const now = new Date().toISOString();
  const prev = ledger.items[fingerprint] || {};
  ledger.items[fingerprint] = {
    ...prev,
    fingerprint,
    status,
    created_at: prev.created_at || now,
    updated_at: now,
    ...attrs
  };
  writeLedger(ledger);
  return ledger.items[fingerprint];
}

module.exports = {
  toFingerprint,
  checkDuplicate,
  markFingerprint
};
