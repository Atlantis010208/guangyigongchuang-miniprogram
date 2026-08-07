'use strict'

const PRODUCTION_ENV_ID = 'cloud1-5gb9c5u2c58ad6d7'

// cloud-env.local.js 不纳入版本管理，新克隆的仓库必然缺失，
// 因此这里给出可直接照做的步骤，避免只报"未配置"让人无从下手。
const SETUP_HINT = [
  '开发版/体验版必须使用独立测试环境，当前尚未配置，已阻止访问生产环境。',
  '请执行：Copy-Item config/cloud-env.example.js config/cloud-env.local.js',
  '再把其中的 TEST_ENV_ID 改为 CloudBase 控制台的测试环境 ID，然后重新编译。'
].join('\n')

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
        code: 'TEST_ENV_NOT_CONFIGURED', message: SETUP_HINT
      }
    }
    return { ok: true, envVersion, envId: testEnvId, isProduction: false, isTest: true }
  }
  return {
    ok: false, envVersion, envId: '', isProduction: false, isTest: false,
    code: 'UNKNOWN_ENV_VERSION', message: '无法识别小程序版本，已终止云数据请求'
  }
}

module.exports = { PRODUCTION_ENV_ID, TEST_ENV_ID, SETUP_HINT, getEnvVersion, resolveCloudEnvironment }
