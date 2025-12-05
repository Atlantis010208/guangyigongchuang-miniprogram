const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
  const { code } = event || {}
  if (!code) {
    return { success: false, code: 'MISSING_CODE', errorMessage: 'missing code' }
  }
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    return { success: true, code: 'OK', phoneInfo: res && res.phoneInfo ? res.phoneInfo : null }
  } catch (err) {
    return { success: false, code: 'PHONE_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}




