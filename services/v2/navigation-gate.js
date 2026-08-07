'use strict'
const { shouldUseV2 } = require('./release-gate')

const LEGACY_ROUTES = Object.freeze({ owner: '/pages/products/products?uiV2Fallback=1', designer: '/pages/designer-home/designer-home?uiV2Fallback=1' })
const V2_ROUTES = Object.freeze({ owner: '/pages/v2/owner-home/index', designer: '/pages/v2/designer-workbench/index' })

async function enterV2IfEnabled(role, options) {
  if (options && String(options.uiV2Fallback || '') === '1') return false
  if (!await shouldUseV2(role)) return false
  wx.reLaunch({ url: V2_ROUTES[role] })
  return true
}

async function enforceV2Gate(role) {
  if (await shouldUseV2(role)) return true
  wx.reLaunch({ url: LEGACY_ROUTES[role] })
  return false
}

module.exports = { LEGACY_ROUTES, V2_ROUTES, enterV2IfEnabled, enforceV2Gate }
