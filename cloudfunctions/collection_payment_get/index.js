const cloud = require('wx-server-sdk')
const {
  ACTIVE_STATUSES,
  getCollectionByToken,
  publicCollectionView,
  isExpired,
  safeAddPaymentLog
} = require('./payment_collection_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid || ''
    const token = String(event.token || event.t || '').trim()
    if (!token) return { success: false, code: 'INVALID_PARAMS', errorMessage: '付款入口无效' }

    const collection = await getCollectionByToken(db, token)
    if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在或已失效' }

    if (isExpired(collection) && ACTIVE_STATUSES.includes(collection.status)) {
      await db.collection('collection_payment_requests').doc(collection._id).update({
        data: {
          status: 'expired',
          updatedAt: new Date()
        }
      })
      collection.status = 'expired'
    }

    await safeAddPaymentLog(db, {
      businessNo: collection.collectionNo,
      action: 'view',
      source: 'miniprogram',
      openidHash: OPENID ? maskHash(OPENID) : '',
      detail: { status: collection.status }
    })

    return {
      success: true,
      code: 'OK',
      data: publicCollectionView(collection)
    }
  } catch (err) {
    console.error('[collection_payment_get] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}

function maskHash(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash) + value.charCodeAt(i)
  return String(Math.abs(hash))
}
