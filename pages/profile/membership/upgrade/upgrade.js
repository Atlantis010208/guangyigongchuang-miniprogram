/**
 * 会员开通独立页（ChatGPT 风格 Tab + 对比表 + CTA）
 * 配套文档：specs/membership_center/design.md §2.2.3 + §5.2 购买流程
 */
const {
  fetchMembershipStatus,
  getRecommendedTab,
  getFallbackStatus
} = require('../../../../utils/membership.js')

// SKU 元数据（与云函数 membership_create_order/sku.js 一致）
// 仅用于前端展示，价格仍由云函数从硬编码 SKU 表读取
const SKU_META = {
  normal: {
    skuId: 'vip_normal_year',
    name: '光乙普通会员',
    priceText: '¥69',
    unit: '/ 年',
    ctaText: '开通普通会员',
    amount: 69
  },
  premium: {
    skuId: 'vip_premium_year',
    name: '光乙高级会员',
    priceText: '¥399',
    unit: '/ 年',
    ctaText: '开通高级会员',
    amount: 399
  }
}

// 权益对比表（共 7 行，与 design.md §2.2.3 对比表一致）
const BENEFITS = [
  { name: '计算器免费版',     free: true,  normal: true,  premium: true,  premiumOnly: false },
  { name: '计算器 Pro UI',    free: false, normal: true,  premium: true,  premiumOnly: false },
  { name: '工具包资料下载',   free: false, normal: true,  premium: true,  premiumOnly: false },
  { name: 'PDF 报告导出',     free: false, normal: true,  premium: true,  premiumOnly: false },
  { name: '报告自定义署名',   free: false, normal: true,  premium: true,  premiumOnly: false },
  { name: '灵感图库下载',     free: false, normal: false, premium: true,  premiumOnly: true  },
  { name: '课程畅看',         free: false, normal: false, premium: true,  premiumOnly: true  }
]

// 轮询订单状态配置
const POLL_INTERVAL_MS = 1500
const POLL_MAX_TIMES = 6

Page({
  data: {
    membership: getFallbackStatus(true),
    activeTab: 'normal',                    // 'normal' | 'premium'
    skuMeta: SKU_META,                      // 用于 wxml 模板引用
    currentSku: SKU_META.normal,            // 当前 Tab 对应的 SKU 元数据
    benefits: BENEFITS,
    benefitsView: [],                       // 渲染用：对比表当前列已计算好
    ctaState: 'normal',                     // 'normal' | 'opened' | 'paying'
    ctaText: '开通普通会员 ¥69 / 年',
    showRenewalLink: false,                 // 已开通该档时是否显示「续费」蓝链
    preferredTab: '',
    isPaying: false
  },

  onLoad(options) {
    const target = options && options.target
    if (target === 'normal' || target === 'premium') {
      this.setData({ preferredTab: target })
    }
    this.refresh()
  },

  onShow() {
    // 从支付返回后再次刷新，避免开通后用户直接看到会员状态
    if (this.data && !this.data.isPaying) {
      this.refresh()
    }
  },

  /**
   * 加载会员状态 + 设置默认 Tab
   */
  async refresh() {
    const membership = await fetchMembershipStatus()
    const effectiveLevel = membership.effectiveLevel || 'free'

    // 高级会员进入此页：劝退（toast 提示后返回）
    if (effectiveLevel === 'premium') {
      wx.showToast({ title: '您已是高级会员', icon: 'none', duration: 1500 })
      setTimeout(() => { wx.navigateBack() }, 1500)
      return
    }

    const preferredTab = this.data.preferredTab
    const recommendedTab = (preferredTab === 'normal' || preferredTab === 'premium')
      ? preferredTab
      : getRecommendedTab(effectiveLevel)
    this.setData({ membership })
    this.switchTab(recommendedTab)
  },

  /**
   * 切换 Tab
   */
  onTabChange(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'normal'
    if (tab !== 'normal' && tab !== 'premium') return
    this.switchTab(tab)
  },

  switchTab(tab) {
    const sku = SKU_META[tab]
    // 普通会员 Tab 下隐藏「高级会员专属」权益行（灵感图库下载、课程畅看）；高级会员 Tab 下全部展示
    const benefitsView = BENEFITS
      .filter((b) => tab === 'premium' || !b.premiumOnly)
      .map((b) => ({
        name: b.name,
        free: b.free,
        current: !!b[tab]
      }))

    const effectiveLevel = (this.data.membership && this.data.membership.effectiveLevel) || 'free'
    const isAlreadyOwned = (tab === 'normal' && effectiveLevel === 'normal')
                        || (tab === 'premium' && effectiveLevel === 'premium')

    let ctaState = 'normal'
    let ctaText = `${sku.ctaText} ${sku.priceText} ${sku.unit}`

    if (isAlreadyOwned) {
      ctaState = 'opened'
      ctaText = '已开通'
    }

    this.setData({
      activeTab: tab,
      currentSku: sku,
      benefitsView,
      ctaState,
      ctaText,
      showRenewalLink: isAlreadyOwned
    })
  },

  /**
   * 协议说明
   */
  onTapAgreement() {
    wx.navigateTo({ url: '/pages/auth/agreement/agreement' })
  },

  /**
   * 已开通档位时点击「续费」
   */
  onTapRenewal() {
    // 续费按当前 Tab 的 SKU 走完整购买流程，后端续费叠加公式自动生效
    this.startPayment()
  },

  /**
   * 点击 CTA 主按钮
   */
  onTapCta() {
    if (this.data.ctaState === 'opened') {
      wx.showToast({ title: '您已开通此档位', icon: 'none' })
      return
    }
    this.startPayment()
  },

  /**
   * 完整购买流程：创建订单 -> 调起支付 -> 轮询确认 -> 跳回
   */
  async startPayment() {
    if (this.data.isPaying) return
    this.setData({ isPaying: true })

    const sku = this.data.currentSku
    if (!sku || !sku.skuId) {
      this.setData({ isPaying: false })
      wx.showToast({ title: '商品信息异常', icon: 'none' })
      return
    }

    wx.showLoading({ title: '正在创建订单…', mask: true })

    try {
      // 1. 创建会员订单（云函数从 SKU 表读取价格）
      const createRes = await wx.cloud.callFunction({
        name: 'membership_create_order',
        data: { skuId: sku.skuId }
      })
      const create = createRes && createRes.result
      if (!create || !create.success) {
        wx.hideLoading()
        const msg = (create && create.errorMessage) || '创建订单失败'
        wx.showToast({ title: msg, icon: 'none' })
        this.setData({ isPaying: false })
        return
      }

      const orderNo = create.data && create.data.orderNo
      if (!orderNo) {
        wx.hideLoading()
        wx.showToast({ title: '订单号缺失', icon: 'none' })
        this.setData({ isPaying: false })
        return
      }

      // 2. 调用 wxpayFunctions.wxpay_order 获取支付参数
      wx.showLoading({ title: '正在调起支付…', mask: true })
      const payRes = await wx.cloud.callFunction({
        name: 'wxpayFunctions',
        data: {
          type: 'wxpay_order',
          orderNo,
          description: sku.name
        }
      })
      const pay = payRes && payRes.result
      if (!pay || pay.code !== 0 || !pay.data) {
        wx.hideLoading()
        const msg = (pay && pay.message) || '支付下单失败'
        wx.showToast({ title: msg, icon: 'none' })
        this.setData({ isPaying: false })
        return
      }

      // 3. 唤起支付
      wx.hideLoading()
      const payParams = pay.data
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: payParams.timeStamp,
          nonceStr: payParams.nonceStr,
          package: payParams.packageVal,
          signType: payParams.signType,
          paySign: payParams.paySign,
          success: resolve,
          fail: reject
        })
      })

      // 4. 轮询订单状态（防止回调延迟）
      wx.showLoading({ title: '确认支付结果…', mask: true })
      const paid = await this.pollOrderPaid(orderNo)
      wx.hideLoading()

      if (paid) {
        wx.showToast({ title: '开通成功', icon: 'success', duration: 1500 })
        setTimeout(() => {
          this.setData({ isPaying: false })
          wx.navigateBack()
        }, 1500)
      } else {
        // 回调可能延迟，提示用户稍后刷新
        wx.showToast({ title: '支付已提交，状态稍后同步', icon: 'none', duration: 2000 })
        setTimeout(() => {
          this.setData({ isPaying: false })
          wx.navigateBack()
        }, 2000)
      }
    } catch (err) {
      wx.hideLoading()
      console.warn('[upgrade] 支付流程异常:', err)
      const errMsg = (err && err.errMsg) || ''
      // 用户主动取消支付：errMsg 包含 "cancel" 字样
      if (errMsg.indexOf('cancel') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else if (errMsg.indexOf('fail') !== -1) {
        wx.showToast({ title: '支付失败', icon: 'none' })
      } else {
        wx.showToast({ title: '支付流程异常，请稍后重试', icon: 'none' })
      }
      this.setData({ isPaying: false })
    }
  },

  /**
   * 轮询订单状态直到 paid 或超时
   */
  pollOrderPaid(orderNo) {
    return new Promise((resolve) => {
      let times = 0
      const tick = async () => {
        times++
        try {
          const res = await wx.cloud.callFunction({
            name: 'wxpayFunctions',
            data: { type: 'wxpay_query_order_by_out_trade_no', orderNo }
          })
          const r = res && res.result
          // 支持多种返回格式：result.data.tradeState 或 result.data.status
          const tradeState = (r && r.data && (r.data.tradeState || r.data.trade_state || r.data.status)) || ''
          const isPaid = tradeState === 'SUCCESS' || tradeState === 'paid'
          if (isPaid) {
            resolve(true)
            return
          }
        } catch (e) {
          console.warn('[upgrade] 查询订单状态异常:', e)
        }
        if (times >= POLL_MAX_TIMES) {
          resolve(false)
          return
        }
        setTimeout(tick, POLL_INTERVAL_MS)
      }
      tick()
    })
  }
})
