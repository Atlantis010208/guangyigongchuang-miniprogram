const assert = require('assert')
const path = require('path')
const { main, assertZeroGate, V2_FUNCTIONS, TEST_SUPPORT_FUNCTIONS, ALLOWED_FUNCTIONS } = require('../scripts/deploy-ui-v2-functions')
const { PRODUCTION_ENV_ID } = require('../config/cloud-env')

const safeGate = path.resolve(__dirname, '..', 'fixtures', 'ui-v2-test', 'ui-release-config.json')
const originalLog = console.log
const originalError = console.error
console.log = () => {}
console.error = () => {}
assert.doesNotThrow(() => assertZeroGate(safeGate))
assert.deepStrictEqual(V2_FUNCTIONS, ['ui_release_gate', 'owner_portal_v2', 'designer_portal_v2'])
assert.ok(TEST_SUPPORT_FUNCTIONS.includes('lighting_cases_list'))
assert.ok(TEST_SUPPORT_FUNCTIONS.includes('designer_projects'))
assert.strictEqual(ALLOWED_FUNCTIONS.length, V2_FUNCTIONS.length + TEST_SUPPORT_FUNCTIONS.length)
assert.strictEqual(main(['--env-id', 'test-env', '--dry-run']), 0)
assert.strictEqual(main(['--env-id', 'test-env', '--include-test-support', '--dry-run']), 0)
assert.strictEqual(main(['--env-id', 'test-env', '--functions', 'admin_cases', '--dry-run']), 2)
assert.strictEqual(main(['--env-id', PRODUCTION_ENV_ID, '--dry-run']), 2)
assert.strictEqual(main(['--env-id', PRODUCTION_ENV_ID, '--functions', 'lighting_cases_list', '--allow-production', '--confirm-zero-percent', '--dry-run']), 2)
assert.strictEqual(main(['--env-id', PRODUCTION_ENV_ID, '--allow-production', '--confirm-zero-percent', '--dry-run']), 0)
console.log = originalLog
console.error = originalError
console.log('ui-v2 deployment guard specs passed')