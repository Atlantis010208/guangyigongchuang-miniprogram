Page({
  data: {
    loading: true,
    paying: false,
    token: '',
    collection: null,
    statusText: '',
    statusClass: '',
    amountText: '¥0.00',
    expireText: '',
    canPay: false
  },

  onLoad(options) {
    const token = options.t || options.token || (options.scene ? decodeURIComponent(options.scene) : '')
    this.setData({ token })
    this.loadCollection()
  },

  onShow() {
    if (this.data.token) this.loadCollection()
  },

  async loadCollection() {
    const token = this.data.token
    if (!token) {
      this.setData({
        loading: false,
        collection: null,
        statusText: '付款入口无效',
        statusClass: 'abnormal',
        canPay: false
      })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'collection_payment_get',
        data: { token }
      })
      const result = res && res.result
      if (!result || !result.success) {
        this.setData({
          loading: false,
          collection: null,
          statusText: (result && result.errorMessage) || '付款信息不可用',
          statusClass: 'abnormal',
          canPay: false
        })
        return
      }

      const collection = result.data
      this.setData({
        loading: false,
        collection,
        amountText: this.formatAmount(collection.amountFen),
        expireText: this.formatTime(collection.expiresAt),
        statusText: this.getStatusText(collection.status),
        statusClass: this.getStatusClass(collection.status),
        canPay: !!collection.canPay && collection.status !== 'paid'
      })
    } catch (err) {
      console.error('[collection-payment] load failed:', err)
      this.setData({
        loading: false,
        collection: null,
        statusText: '付款信息加载失败',
        statusClass: 'abnormal',
        canPay: false
      })
    }
  },

  async onPay() {
    if (!this.data.canPay || this.data.paying) return
    this.setData({ paying: true })
    try {
      const prep = await wx.cloud.callFunction({
        name: 'collection_payment_prepare',
        data: { token: this.data.token }
      })
      const result = prep && prep.result
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.errorMessage) || '支付初始化失败', icon: 'none' })
        this.setData({ paying: false })
        this.loadCollection()
        return
      }

      const payParams = result.data || {}
      await wx.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.packageVal,
        signType: payParams.signType || 'RSA',
        paySign: payParams.paySign
      })

      await this.confirmPayment()
      wx.showToast({ title: '支付成功', icon: 'success' })
      this.loadCollection()
    } catch (err) {
      console.warn('[collection-payment] pay cancelled or failed:', err)
      const message = err && err.errMsg && err.errMsg.indexOf('cancel') >= 0 ? '已取消支付' : '支付未完成'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ paying: false })
    }
  },

  async confirmPayment() {
    try {
      await wx.cloud.callFunction({
        name: 'collection_payment_confirm',
        data: { token: this.data.token }
      })
    } catch (err) {
      console.warn('[collection-payment] confirm failed:', err)
    }
  },

  onRefresh() {
    this.loadCollection()
  },

  onCopyCollectionNo() {
    const collectionNo = this.data.collection && this.data.collection.collectionNo
    if (!collectionNo) return
    wx.setClipboardData({
      data: collectionNo,
      success: () => {
        wx.showToast({ title: '收款单号已复制', icon: 'none' })
      }
    })
  },

  formatAmount(amountFen) {
    const value = Number(amountFen || 0) / 100
    return `¥${value.toFixed(2)}`
  },

  formatTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },

  getStatusText(status) {
    const map = {
      pending: '待支付',
      paying: '支付处理中',
      paid: '已支付',
      refunding: '退款处理中',
      refunded: '已退款',
      refund_failed: '退款失败',
      cancelled: '已取消',
      expired: '已过期',
      abnormal: '支付异常'
    }
    return map[status] || '暂不可支付'
  },

  getStatusClass(status) {
    if (status === 'paid') return 'paid'
    if (status === 'refunding') return 'pending'
    if (status === 'refunded') return 'paid'
    if (status === 'pending' || status === 'paying') return 'pending'
    if (status === 'abnormal' || status === 'refund_failed') return 'abnormal'
    return 'closed'
  }
})
