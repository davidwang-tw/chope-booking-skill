#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkCmd(label, cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    return { ok: false, label, message: `${cmd} not found on PATH` };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      label,
      message: (result.stderr || result.stdout || result.error?.message || '').trim() || `${cmd} exited ${result.status}`
    };
  }
  return { ok: true, label, output: (result.stdout || '').trim() };
}

function ok(label, message = '') {
  console.log(`✓ ${label}${message ? ` — ${message}` : ''}`);
}

function fail(label, message) {
  console.error(`✗ ${label} — ${message}`);
  return false;
}

let passed = true;

const nodeMajor = Number(process.versions.node.split('.')[0] || 0);
if (nodeMajor >= 20) {
  ok('Node.js version', process.version);
} else {
  passed = fail('Node.js version', `${process.version} is too old; need Node 20+`);
}

const openclaw = checkCmd('OpenClaw CLI', 'openclaw', ['--version']);
if (openclaw.ok) {
  ok('OpenClaw CLI', openclaw.output || 'found');
} else {
  passed = fail('OpenClaw CLI', openclaw.message);
}

const browser = checkCmd('OpenClaw browser tool', 'openclaw', ['browser', 'status']);
if (browser.ok) {
  ok('OpenClaw browser tool', browser.output || 'available');
} else {
  const hint = browser.message.includes('not found on PATH')
    ? 'Install OpenClaw and ensure `openclaw` is on PATH.'
    : 'Make sure this runs inside an OpenClaw instance with browser support enabled.';
  passed = fail('OpenClaw browser tool', `${browser.message}. ${hint}`);
}

const root = process.cwd();
const required = [
  'SKILL.md',
  'README.md',
  'package.json',
  'scripts/chope_search.js',
  'scripts/chope_availability.js',
  'scripts/chope_book.js',
  'scripts/chope_resume.js',
  'scripts/openclaw_browser.js'
];

for (const rel of required) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    ok('File present', rel);
  } else {
    passed = fail('File present', `${rel} is missing`);
  }
}

const stateDir = process.env.CHOPE_STATE_DIR || path.join(os.tmpdir(), 'chope-booking-sessions');
const logDir = process.env.CHOPE_LOG_DIR || path.join(os.tmpdir(), 'chope-booking-logs');
ok('State dir', stateDir);
ok('Log dir', logDir);

if (!passed) process.exitCode = 1;
