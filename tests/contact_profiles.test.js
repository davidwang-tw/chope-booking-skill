const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chope-profiles-test-'));
process.env.CHOPE_STATE_DIR = path.join(tempRoot, 'state');

const profiles = require('../scripts/contact_profiles');

test('save/get/list/delete contact profile', () => {
  const user = 'user-1';
  const saved = profiles.saveOrUpdate(user, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    mobile: '+6591234567'
  });
  assert.ok(saved.profile_id);
  assert.equal(profiles.list(user).length, 1);
  assert.equal(profiles.getDefault(user).profile_id, saved.profile_id);
  assert.equal(profiles.remove(user, saved.profile_id), true);
  assert.equal(profiles.list(user).length, 0);
});
