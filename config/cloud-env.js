'use strict'

const PRODUCTION_ENV_ID = 'cloud1-5gb9c5u2c58ad6d7'
let local = {}
try { local = require('./cloud-env.local') } catch (_) {}
const TEST_ENV_ID = String(local.TEST_ENV_ID || '').trim()

function getEnvVersion(wxApi) {
  try {
    const info = wxApi.getAccountInfoSync()
    return String(info && info.miniProgram && info.miniProgram.envVersion || '').trim()
  } catch (_) { return '' }
}

function resolveCloudEnvironment(wxApi, overrides) {
  const envVersion = getEnvVersion(wxApi)
  const testEnvId = String(overrides && overrides.testEnvId !== undefined ? overrides.testEnvId : TEST_ENV_ID).trim()
  if (envVersion === 'release') {
    return { ok: true, envVersion, envId: PRODUCTION_ENV_ID, isProduction: true, isTest: false }
  }
  if (envVersion === 'develop' || envVersion === 'trial') {
    if (!testEnvId || testEnvId === PRODUCTION_ENV_ID) {
      return {
        ok: false, envVersion, envId: '', isProduction: false, isTest: true,
        code: 'TEST_ENV_NOT_CONFIGURED', message: '测试环境未配置，已阻止访问生产环境'
      }
    }
    return { ok: true, envVersion, envId: testEnvId, isProduction: false, isTest: true }
  }
  return {
    ok: false, envVersion, envId: '', isProduction: false, isTest: false,
    code: 'UNKNOWN_ENV_VERSION', message: '无法识别小程序版本，已终止云数据请求'
  }
}

module.exports = { PRODUCTION_ENV_ID, TEST_ENV_ID, getEnvVersion, resolveCloudEnvironment }
