const assert = require('assert')
const { PRODUCTION_ENV_ID, resolveCloudEnvironment } = require('../config/cloud-env')
const wxFor = envVersion => ({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }) })
assert.strictEqual(resolveCloudEnvironment(wxFor('release')).envId, PRODUCTION_ENV_ID)
for (const version of ['develop','trial']) {
  const result = resolveCloudEnvironment(wxFor(version), { testEnvId: 'should-not-be-used', useProduction: false })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.isProduction, true)
  assert.strictEqual(result.isTest, false)
  assert.strictEqual(result.envId, PRODUCTION_ENV_ID)
}
assert.strictEqual(resolveCloudEnvironment(wxFor('unknown')).ok, false)
