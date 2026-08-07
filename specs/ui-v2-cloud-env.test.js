const assert = require('assert')
const { PRODUCTION_ENV_ID, resolveCloudEnvironment } = require('../config/cloud-env')
const wxFor = envVersion => ({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }) })
assert.strictEqual(resolveCloudEnvironment(wxFor('release')).envId, PRODUCTION_ENV_ID)
for (const version of ['develop','trial']) {
  const blocked = resolveCloudEnvironment(wxFor(version), { testEnvId: '' })
  assert.strictEqual(blocked.ok, false)
  assert.notStrictEqual(blocked.envId, PRODUCTION_ENV_ID)
  const test = resolveCloudEnvironment(wxFor(version), { testEnvId: 'ui-v2-test-env' })
  assert.strictEqual(test.ok, true)
  assert.strictEqual(test.isTest, true)
  assert.strictEqual(test.envId, 'ui-v2-test-env')
}
assert.strictEqual(resolveCloudEnvironment(wxFor('unknown')).ok, false)
