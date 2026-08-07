'use strict'
const cloud = require('wx-server-sdk')
const { DEFAULT_CONFIG, evaluateGate } = require('./policy')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: true, data: evaluateGate(DEFAULT_CONFIG, '') }
  try {
    const result = await db.collection('ui_release_config').doc('miniprogram_ui_v2').get()
    return { success: true, data: evaluateGate(result && result.data, OPENID) }
  } catch (error) {
    console.warn('[ui_release_gate] fail closed', error && error.message)
    return { success: true, data: evaluateGate(DEFAULT_CONFIG, OPENID) }
  }
}
