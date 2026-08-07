const assert = require('assert')
const { callCloud } = require('../services/v2/cloud')

;(async () => {
  let calls = 0
  global.getApp = () => ({ globalData: { cloudEnvironment: { ok: false, code: 'TEST_ENV_NOT_CONFIGURED', message: 'blocked' } } })
  global.wx = { cloud: { callFunction: () => { calls += 1; return Promise.resolve({}) } } }
  const blocked = await callCloud('owner_portal_v2', {})
  assert.strictEqual(blocked.ok, false)
  assert.strictEqual(blocked.code, 'TEST_ENV_NOT_CONFIGURED')
  assert.strictEqual(calls, 0, 'blocked environment must not issue a cloud request')

  global.getApp = () => ({ globalData: { cloudEnvironment: { ok: true, envId: 'test-env', isTest: true } } })
  global.wx.cloud.callFunction = () => Promise.resolve({ result: { success: true, code: 'OK', data: null } })
  const empty = await callCloud('owner_portal_v2', {})
  assert.deepStrictEqual(empty, { ok: true, code: 'OK', message: '', data: null })

  global.wx.cloud.callFunction = () => Promise.resolve({ result: { success: false, code: 'UNAUTHENTICATED', message: 'login expired' } })
  const login = await callCloud('owner_portal_v2', {})
  assert.strictEqual(login.ok, false)
  assert.strictEqual(login.code, 'UNAUTHENTICATED')

  global.wx.cloud.callFunction = () => Promise.reject(new Error('network down'))
  const failed = await callCloud('owner_portal_v2', {})
  assert.strictEqual(failed.ok, false)
  assert.strictEqual(failed.code, 'CLOUD_CALL_FAILED')

  global.wx.cloud.callFunction = () => new Promise(() => {})
  const timeout = await callCloud('owner_portal_v2', {}, 1)
  assert.strictEqual(timeout.ok, false)
  assert.strictEqual(timeout.code, 'CLOUD_TIMEOUT')
  console.log('ui-v2 cloud client specs passed')
})().catch(error => { setTimeout(() => { throw error }, 0) })
