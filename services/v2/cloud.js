'use strict'

const DEFAULT_TIMEOUT = 4000

function getCloudState() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.cloudEnvironment
  } catch (_) { return null }
}

function callCloud(name, data, timeoutMs) {
  const state = getCloudState()
  if (!state || !state.ok) {
    return Promise.resolve({ ok: false, code: state && state.code || 'CLOUD_ENV_BLOCKED', message: state && state.message || '云环境不可用', data: null })
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = value => { if (!settled) { settled = true; resolve(value) } }
    const timer = setTimeout(() => finish({ ok: false, code: 'CLOUD_TIMEOUT', message: '请求超时', data: null }), timeoutMs || DEFAULT_TIMEOUT)
    wx.cloud.callFunction({ name, data: data || {} }).then(response => {
      clearTimeout(timer)
      const result = response && response.result || {}
      if (result.success === true) finish({ ok: true, code: result.code || 'OK', message: result.message || '', data: result.data })
      else finish({ ok: false, code: result.code || 'CLOUD_FUNCTION_FAILED', message: result.message || result.errorMessage || '请求失败', data: result.data || null })
    }).catch(error => {
      clearTimeout(timer)
      finish({ ok: false, code: 'CLOUD_CALL_FAILED', message: error && (error.errMsg || error.message) || '请求失败', data: null })
    })
  })
}

module.exports = { DEFAULT_TIMEOUT, getCloudState, callCloud }
