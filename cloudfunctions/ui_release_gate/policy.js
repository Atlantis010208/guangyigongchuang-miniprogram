'use strict'
const crypto = require('crypto')

const DEFAULT_CONFIG = Object.freeze({
  uiVersion: 'v2',
  enabled: false,
  ownerEnabled: false,
  designerEnabled: false,
  ownerPercent: 0,
  designerPercent: 0,
  ownerWhitelistHashes: [],
  designerWhitelistHashes: [],
  whitelistOpenidHashes: []
})

function openidHash(openid) {
  return crypto.createHash('sha256').update(String(openid || '')).digest('hex')
}

function stableBucket(openid) {
  const hex = openidHash(openid).slice(0, 8)
  return parseInt(hex || '0', 16) % 100
}

function clampPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.floor(number)))
}

function evaluateGate(rawConfig, openid) {
  const config = Object.assign({}, DEFAULT_CONFIG, rawConfig || {})
  const hash = openidHash(openid)
  const bucket = stableBucket(openid)
  const sharedWhitelist = Array.isArray(config.whitelistOpenidHashes) ? config.whitelistOpenidHashes : []
  const ownerWhitelist = Array.isArray(config.ownerWhitelistHashes) ? config.ownerWhitelistHashes : []
  const designerWhitelist = Array.isArray(config.designerWhitelistHashes) ? config.designerWhitelistHashes : []
  const ownerWhitelisted = sharedWhitelist.includes(hash) || ownerWhitelist.includes(hash)
  const designerWhitelisted = sharedWhitelist.includes(hash) || designerWhitelist.includes(hash)
  const masterEnabled = config.enabled === true
  const ownerPercent = clampPercent(config.ownerPercent)
  const designerPercent = clampPercent(config.designerPercent)
  return {
    uiVersion: config.uiVersion === 'v2' ? 'v2' : 'v1',
    ownerEnabled: masterEnabled && config.ownerEnabled === true && (ownerWhitelisted || bucket < ownerPercent),
    designerEnabled: masterEnabled && config.designerEnabled === true && (designerWhitelisted || bucket < designerPercent),
    ownerPercent,
    designerPercent,
    whitelisted: ownerWhitelisted || designerWhitelisted,
    ownerWhitelisted,
    designerWhitelisted,
    bucket
  }
}

module.exports = { DEFAULT_CONFIG, openidHash, stableBucket, clampPercent, evaluateGate }
