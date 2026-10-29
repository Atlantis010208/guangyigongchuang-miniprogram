'use strict'
const { callCloud } = require('./cloud')

const CLOSED_GATE = Object.freeze({
  uiVersion: 'v1', ownerEnabled: false, designerEnabled: false,
  ownerPercent: 0, designerPercent: 0, whitelisted: false, bucket: -1
})

function getMiniProgramEnvVersion() {
  try {
    const info = wx.getAccountInfoSync()
    return String(info && info.miniProgram && info.miniProgram.envVersion || '').trim()
  } catch (_) {
    return ''
  }
}

async function getReleaseGate() {
  const response = await callCloud('ui_release_gate', {}, 4000)
  if (!response.ok || !response.data) return Object.assign({}, CLOSED_GATE)
  return Object.assign({}, CLOSED_GATE, response.data)
}

async function shouldUseV2(role) {
  // 新版 UI 全量上线：正式版、体验版和开发版保持一致。
  // 已识别的版本不再依赖旧灰度配置，避免发布后仍被导向旧版 UI。
  const envVersion = getMiniProgramEnvVersion()
  if (envVersion === 'release' || envVersion === 'develop' || envVersion === 'trial') return true

  const gate = await getReleaseGate()
  if (gate.uiVersion !== 'v2') return false
  return role === 'designer' ? gate.designerEnabled === true : gate.ownerEnabled === true
}

module.exports = { CLOSED_GATE, getMiniProgramEnvVersion, getReleaseGate, shouldUseV2 }
