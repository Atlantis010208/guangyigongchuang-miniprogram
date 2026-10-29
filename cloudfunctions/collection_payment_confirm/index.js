const cloud = require('wx-server-sdk')
const {
  getCollectionByToken,
  getCollectionByNo,
  syncGeneralCollectionSuccess,
  safeAddPaymentLog
} = require('./payment_collection_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid || ''
    const token = String(event.token || event.t || '').trim()
    const collectionNo = String(event.collectionNo || '').trim()
    const collection = token ? await getCollectionByToken(db, token) : await getCollectionByNo(db, collectionNo)
    if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在或已失效' }
    if (!collection.currentOutTradeNo) {
      return { success: true, code: 'OK', message: '暂无支付尝试', data: { status: collection.status } }
    }

    const order = await getOrder(collection.currentOutTradeNo)
    if (!order) return { success: false, code: 'ORDER_NOT_FOUND', errorMessage: '本地支付尝试不存在' }
    if (OPENID && order.userId !== OPENID) {
      return { success: false, code: 'NO_PERMISSION', errorMessage: '无权确认该支付订单' }
    }

    const queryRes = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_query_order_by_out_trade_no',
        orderNo: collection.currentOutTradeNo,
        syncStatus: false
      }
    })
    const wxResult = queryRes && queryRes.result ? queryRes.result : queryRes
    if (!wxResult || wxResult.code !== 0) {
      return { success: false, code: 'WECHAT_QUERY_FAILED', errorMessage: wxResult && wxResult.message || '微信查单失败' }
    }

    let syncResult = null
    const tradeState = wxResult.data && wxResult.data.tradeState
    if (tradeState === 'SUCCESS') {
      syncResult = await syncGeneralCollectionSuccess(db, _, order, {
        transactionId: wxResult.data.transactionId,
        successTime: wxResult.data.successTime,
        tradeState,
        amount: wxResult.data.amount
      }, 'miniprogram_query')
    } else {
      await db.collection('collection_payment_requests').doc(collection._id).update({
        data: {
          lastQueryAt: new Date(),
          lastQueryTradeState: tradeState || '',
          lastQueryResult: wxResult.data,
          updatedAt: new Date()
        }
      })
    }

    await safeAddPaymentLog(db, {
      businessNo: collection.collectionNo,
      outTradeNo: collection.currentOutTradeNo,
      action: 'confirm',
      source: 'miniprogram',
      openidHash: OPENID ? OPENID.slice(0, 8) : '',
      detail: { tradeState }
    })

    const latest = await getCollectionByNo(db, collection.collectionNo)
    return {
      success: true,
      code: 'OK',
      data: {
        status: latest ? latest.status : collection.status,
        tradeState,
        syncResult
      }
    }
  } catch (err) {
    console.error('[collection_payment_confirm] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}

async function getOrder(orderNo) {
  const res = await db.collection('orders').where({ orderNo }).limit(1).get()
  return res.data && res.data[0] ? res.data[0] : null
}
