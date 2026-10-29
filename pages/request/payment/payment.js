Page({
  data: {
    loading: true,
    paying: false,
    paymentRequestNo: '',
    payment: null,
    statusText: '',
    statusClass: '',
    amountText: '¥0.00',
    expireText: '',
    serviceTypeText: '灯光设计服务',
    canPay: false
  },

  onLoad(options) {
    const paymentRequestNo = options.paymentRequestNo || ''
    this.setData({ paymentRequestNo })
    this.loadPayment()
  },

  onShow() {
    if (this.data.paymentRequestNo) this.loadPayment()
  },

  async loadPayment() {
    const paymentRequestNo = this.data.paymentRequestNo
    if (!paymentRequestNo) {
      this.setData({
        loading: false,
        payment: null,
        statusText: '付款入口无效',
        statusClass: 'abnormal',
        canPay: false
      })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'design_payment_get',
        data: { paymentRequestNo }
      })
      const result = res && res.result
      if (!result || !result.success) {
        this.setData({
          loading: false,
          payment: null,
          statusText: (result && result.errorMessage) || '付款信息不可用',
          statusClass: result && result.code === 'NO_PERMISSION' ? 'no-permission' : 'abnormal',
          canPay: false
        })
        return
      }

      const payment = result.data
      this.setData({
        loading: false,
        payment,
        amountText: this.formatAmount(payment.amountFen),
        expireText: this.formatTime(payment.expiresAt),
        serviceTypeText: this.resolveServiceType(payment),
        statusText: this.getStatusText(payment.status),
        statusClass: this.getStatusClass(payment.status),
        canPay: !!payment.canPay
      })
    } catch (err) {
      console.error('[design-payment] load failed:', err)
      this.setData({
        loading: false,
        payment: null,
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
        name: 'design_payment_prepare',
        data: { paymentRequestNo: this.data.paymentRequestNo }
      })
      const result = prep && prep.result
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.errorMessage) || '支付初始化失败', icon: 'none' })
        this.setData({ paying: false })
        this.loadPayment()
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
      this.loadPayment()
    } catch (err) {
      console.warn('[design-payment] pay cancelled or failed:', err)
      const message = err && err.errMsg && err.errMsg.indexOf('cancel') >= 0 ? '已取消支付' : '支付未完成'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ paying: false })
    }
  },

  async confirmPayment() {
    try {
      await wx.cloud.callFunction({
        name: 'design_payment_confirm',
        data: { paymentRequestNo: this.data.paymentRequestNo }
      })
    } catch (err) {
      console.warn('[design-payment] confirm failed:', err)
    }
  },

  onRefresh() {
    this.loadPayment()
  },

  onCopyPaymentNo() {
    const paymentRequestNo = (this.data.payment && this.data.payment.paymentRequestNo) || this.data.paymentRequestNo
    if (!paymentRequestNo) return
    wx.setClipboardData({
      data: paymentRequestNo,
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

  resolveServiceType(payment) {
    return payment.serviceType || payment.serviceName || '灯光设计服务'
  },

  getStatusText(status) {
    const map = {
      pending: '待支付',
      paying: '支付确认中',
      paid: '已支付',
      cancelled: '已取消',
      expired: '已过期',
      abnormal: '支付异常',
      refund_reserved: '退款处理中'
    }
    return map[status] || '不可支付'
  },

  getStatusClass(status) {
    if (status === 'paid') return 'paid'
    if (status === 'pending' || status === 'paying') return 'pending'
    if (status === 'abnormal') return 'abnormal'
    return 'closed'
  }
})
