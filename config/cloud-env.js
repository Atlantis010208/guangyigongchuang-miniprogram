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

function isUseProduction(overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, 'useProduction')) {
    return Boolean(overrides.useProduction)
  }
  return Boolean(local.USE_PRODUCTION)
}

function resolveCloudEnvironment(wxApi, overrides) {
  const envVersion = getEnvVersion(wxApi)
  // 三种可发布版本统一使用生产 CloudBase。
  // 新版 UI 的入口策略统一由 services/v2/release-gate.js 管理。
  if (envVersion === 'release' || envVersion === 'develop' || envVersion === 'trial') {
    return {
      ok: true,
      envVersion,
      envId: PRODUCTION_ENV_ID,
      isProduction: true,
      isTest: false,
      source: 'production'
    }
  }
  return {
    ok: false, envVersion, envId: '', isProduction: false, isTest: false,
    code: 'UNKNOWN_ENV_VERSION', message: '无法识别小程序版本，已终止云数据请求'
  }
}

module.exports = { PRODUCTION_ENV_ID, TEST_ENV_ID, SETUP_HINT, getEnvVersion, resolveCloudEnvironment }
