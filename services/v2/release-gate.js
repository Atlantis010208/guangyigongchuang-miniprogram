'use strict'
const { callCloud } = require('./cloud')

const CLOSED_GATE = Object.freeze({
  uiVersion: 'v1', ownerEnabled: false, designerEnabled: false,
  ownerPercent: 0, designerPercent: 0, whitelisted: false, bucket: -1
})

async function getReleaseGate() {
  const response = await callCloud('ui_release_gate', {}, 4000)
  if (!response.ok || !response.data) return Object.assign({}, CLOSED_GATE)
  return Object.assign({}, CLOSED_GATE, response.data)
}

async function shouldUseV2(role) {
  const gate = await getReleaseGate()
  if (gate.uiVersion !== 'v2') return false
  return role === 'designer' ? gate.designerEnabled === true : gate.ownerEnabled === true
}

module.exports = { CLOSED_GATE, getReleaseGate, shouldUseV2 }
