'use strict'
const assert = require('assert')
const { shouldUseV2 } = require('../services/v2/release-gate')
const { enterV2IfEnabled, enforceV2Gate } = require('../services/v2/navigation-gate')

async function main() {
  const destinations = {
    owner: '/pages/v2/owner-home/index',
    designer: '/pages/v2/designer-learning/index'
  }
  // UI entry must work even when the cloud gate is unavailable.
  global.getApp = () => ({ globalData: {} })
  for (const envVersion of ['release', 'trial', 'develop']) {
    const navigations = []
    global.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
      reLaunch: options => navigations.push(options.url)
    }
    for (const role of Object.keys(destinations)) {
      assert.strictEqual(await shouldUseV2(role), true, `${envVersion}/${role} must use V2`)
      assert.strictEqual(await enterV2IfEnabled(role, {}), true)
      assert.strictEqual(navigations.pop(), destinations[role])
      assert.strictEqual(await enforceV2Gate(role), true)
      assert.deepStrictEqual(navigations, [], 'V2 page must not redirect back to legacy')
      assert.strictEqual(await enterV2IfEnabled(role, { uiV2Fallback: '1' }), false)
      assert.deepStrictEqual(navigations, [], 'explicit legacy fallback must remain available')
    }
  }
  global.wx = { getAccountInfoSync: () => { throw new Error('unavailable') } }
  assert.strictEqual(await shouldUseV2('owner'), false)
}

main().catch(error => { throw error })
