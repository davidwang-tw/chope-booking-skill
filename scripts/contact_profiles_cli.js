#!/usr/bin/env node
const { jsonOut } = require('./openclaw_browser');
const profiles = require('./contact_profiles');
const { arg } = require('./shared');

const action = arg('action');
const userId = arg('user-id');
const profileId = arg('profile-id');

if (!action || !userId) {
  jsonOut({ status: 'failed', error: 'usage: --action <list|get-default|set-default|delete|delete-all> --user-id <id> [--profile-id <id>]' });
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

if (action === 'set-default') {
  if (!profileId) {
    jsonOut({ status: 'failed', error: 'set-default requires --profile-id' });
    process.exit(2);
  }
  jsonOut({ status: 'success', updated: profiles.setDefault(userId, profileId) });
  process.exit(0);
}

if (action === 'delete-all') {
  jsonOut({ status: 'success', deleted: profiles.removeAll(userId) });
  process.exit(0);
}

jsonOut({ status: 'failed', error: `unknown action: ${action}` });
process.exit(2);
