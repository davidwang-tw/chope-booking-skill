#!/usr/bin/env node
const { jsonOut } = require('./openclaw_browser');
const profiles = require('./contact_profiles');

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const action = arg('action');
const userId = arg('user-id');
const profileId = arg('profile-id');

if (!action || !userId) {
  jsonOut({ status: 'failed', error: 'usage: --action <list|get-default|delete> --user-id <id> [--profile-id <id>]' });
  process.exit(2);
}

if (action === 'list') {
  jsonOut({ status: 'success', profiles: profiles.list(userId) });
  process.exit(0);
}

if (action === 'get-default') {
  jsonOut({ status: 'success', profile: profiles.getDefault(userId) });
  process.exit(0);
}

if (action === 'delete') {
  if (!profileId) {
    jsonOut({ status: 'failed', error: 'delete requires --profile-id' });
    process.exit(2);
  }
  jsonOut({ status: 'success', deleted: profiles.remove(userId, profileId) });
  process.exit(0);
}

jsonOut({ status: 'failed', error: `unknown action: ${action}` });
process.exit(2);
