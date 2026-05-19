/**
 * 个人中心首页
 * 功能：显示用户信息、导航到各子页面
 */
const auth = require('../../../utils/auth.js')
const {
  fetchMembershipStatus,
  formatExpireDate
} = require('../../../utils/membership.js')

/**
 * 会员卡背景图 cloud fileID 映射
 * key 与 utils/membership.js 的 effectiveLevel 对齐：'free' | 'normal' | 'premium'
 * 云存储文件名仍用 level-none.png（普通用户 = effectiveLevel 'free'）
 */
const MEMBER_CARD_BG_FILE_IDS = {
  free: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/membership-card/level-none.png',
  normal: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/membership-card/level-normal.png',
  premium: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/membership-card/level-premium.png'
}

/**
 * effectiveLevel → 中文显示名映射（与会员卡背景图保持一致）
 */
const VIP_LEVEL_LABELS = {
  free: '普通用户',
  normal: '会员',
  premium: '高级会员'
}

// 会员卡临时链接缓存：避免相同等级重复请求 getTempFileURL
const _memberCardBgUrlCache = {}

Page({
  data: {
    user: { name: '', phone: '', avatar: '' },
    userAvatarDisplay: '', // 用于显示的头像临时链接
    userAvatarFileID: '', // 原始 cloud:// fileID
    userId: '',
    openid: '',
    isAdmin: false,
    isDesigner: false,
    isLoggedIn: false, // 登录状态

    // 会员卡相关字段（缺失时显示 '--'）
    memberId: '',              // 会员ID
    memberLevelName: '',       // 会员等级名（如：尊享会员）
    memberExpireDate: '',      // 有效期
    memberGrowth: '0',         // 当前成长值
    memberGrowthMax: '0',      // 下一级所需成长值
    memberProgressPercent: 0,  // 进度百分比 0-100
    memberNextLevelTip: '',    // 下一级提示文字（如：升级至钻石会员）

    // 会员卡背景图（根据 effectiveLevel 切换）
    effectiveLevel: 'free',    // 'free' | 'normal' | 'premium'，来自 membership_status 云函数
    memberCardBg: '',          // 会员卡背景图 https 临时链接（异步加载）

    // 四宫格统计数据（空字符串 → 显示 '--'）
    orderCount: '',     // 订单数
    favCount: '',       // 收藏数
    cartCount: '',      // 购物车数
    addressCount: ''    // 地址数
  },

  onShow() {
    // 检查登录状态
    const app = getApp()
    const isLoggedIn = app.isLoggedIn()
    console.log('个人中心 onShow - 登录状态:', isLoggedIn)
    this.setData({ isLoggedIn })
    
    if (isLoggedIn) {
      this.loadUserData()
    }
    
    // 延迟再次检查登录状态，以防云端验证后状态改变
    setTimeout(() => {
      const latestStatus = app.isLoggedIn()
      if (latestStatus !== this.data.isLoggedIn) {
        console.log('登录状态已变化，重新设置:', latestStatus)
        this.setData({ isLoggedIn: latestStatus })
        if (!latestStatus) {
          // 状态变为未登录，清空用户数据
          this.setData({
            user: { name: '', phone: '', avatar: '' },
            userAvatarDisplay: ''
          })
        }
      }
    }, 500)
  },

  /**
   * 登录状态改变回调(由 app.js 的 verifyCloudLoginStatus 触发)
   * @param {boolean} isLoggedIn 最新的登录状态
   */
  onLoginStatusChanged(isLoggedIn) {
    console.log('登录状态改变回调:', isLoggedIn)
    this.setData({ isLoggedIn })
    if (!isLoggedIn) {
      // 清空用户数据
      this.setData({
        user: { name: '', phone: '', avatar: '' },
        userAvatarDisplay: '',
        userId: '',
        openid: ''
      })
    } else {
      // 重新加载用户数据
      this.loadUserData()
    }
  },

  /**
   * 加载用户数据
   * 优先从云数据库获取，失败则使用本地缓存
   */
  async loadUserData() {
    try {
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      const userId = cachedDoc && cachedDoc._id ? cachedDoc._id : ''
      const openid = wx.getStorageSync('openid') || ''
      
      this.setData({ userId, openid })

      // 如果没有云开发或没有任何标识，使用本地存储
      if (!wx.cloud || (!userId && !openid)) {
        this.loadFromLocalStorage()
        return
      }

      const db = wx.cloud.database()
      let doc = null

      // 方法1：通过 _id 查询（需要 try-catch 因为文档不存在会报错）
      if (userId) {
        try {
          const d = await db.collection('users').doc(userId).get()
          doc = d && d.data
        } catch (docErr) {
          // _id 查询失败（文档可能已被删除），降级使用 _openid 查询
          console.warn('通过 _id 查询失败，尝试使用 _openid 查询', docErr.message)
        }
      }

      // 方法2：如果 _id 查询失败，通过 _openid 查询
      if (!doc && openid) {
        try {
          const q = await db.collection('users').where({ _openid: openid }).limit(1).get()
          doc = (q && q.data && q.data[0]) || null
        } catch (queryErr) {
          console.warn('通过 _openid 查询失败', queryErr.message)
        }
      }

      // 成功获取到用户文档
      if (doc) {
        // 更新本地缓存（确保 _id 是最新的）
        try { 
          wx.setStorageSync('userDoc', doc) 
        } catch (e) {
          console.warn('更新 userDoc 缓存失败', e)
        }

        // 计算会员卡展示字段
        const memberFields = this._buildMemberFields(doc)

        this.setData({
          user: {
            name: doc.nickname || '',
            phone: doc.phoneNumber || '',
            avatar: doc.avatarUrl || ''
          },
          userId: doc._id || '',
          isAdmin: auth.isAdmin(doc),
          isDesigner: auth.isDesigner(doc),
          ...memberFields
        })

        // 转换头像为临时链接
        if (doc.avatarUrl) {
          await this.convertAvatarUrl(doc.avatarUrl)
        }

        // 异步加载会员状态（effectiveLevel/vipExpireAt 由 membership_status 云函数权威返回）
        this._loadMembership()

        // 异步加载四宫格统计数据（订单/收藏/购物车/地址）
        this._loadCounts(doc)
        return
      }

      // 云端没有用户记录，可能是登录状态无效
      console.warn('云端未找到用户记录，本地缓存可能已过期')
      
      // 清理可能过期的缓存
      this.clearInvalidCache()
      
      // 使用本地存储作为兜底
      this.loadFromLocalStorage()
      
    } catch (err) {
      console.error('加载个人中心用户资料失败', err)
      // 发生错误时使用本地存储兜底
      this.loadFromLocalStorage()
    }
  },

  /**
   * 从本地存储加载用户信息（兜底方案）
   */
  async loadFromLocalStorage() {
    const local = wx.getStorageSync('user_profile') || {}
    const cachedDoc = wx.getStorageSync('userDoc') || {}
    const avatarUrl = local.avatar || cachedDoc.avatarUrl || ''
    
    this.setData({
      user: {
        name: local.name || cachedDoc.nickname || '',
        phone: local.phone || cachedDoc.phoneNumber || '',
        avatar: avatarUrl
      }
    })

    // 转换头像
    if (avatarUrl) {
      await this.convertAvatarUrl(avatarUrl)
    }
  },

  /**
   * 清理无效的缓存
   * 当云端找不到用户记录时调用
   */
  clearInvalidCache() {
    try {
      // 只清理 userDoc 中的 _id，保留其他信息
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      if (cachedDoc._id) {
        delete cachedDoc._id
        wx.setStorageSync('userDoc', cachedDoc)
        console.log('已清理无效的 userDoc._id')
      }
    } catch (e) {
      console.warn('清理缓存失败', e)
    }
  },
  
  /**
   * 编辑资料
   */
  editProfile(e) {
    console.log('editProfile 被触发', e)
    
    // 再次检查登录状态
    const app = getApp()
    const isLoggedIn = app.isLoggedIn()
    const openid = wx.getStorageSync('openid')
    
    console.log('editProfile - 登录状态:', isLoggedIn, ', openid:', openid)
    
    if (!isLoggedIn || !openid) {
      // 更新页面状态
      this.setData({ 
        isLoggedIn: false,
        user: { name: '', phone: '', avatar: '' },
        userAvatarDisplay: ''
      })
      
      wx.showModal({
        title: '提示',
        content: '登录状态已失效，请重新登录',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ 
              url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/profile/home/home')
            })
          }
        }
      })
      return
    }
    
    // 登录状态正常，跳转到编辑页面
    wx.navigateTo({ url: '/pages/auth/profile-edit/profile-edit' })
  },
  
  /**
   * 页面跳转
   */
  go(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    
    // 订单跳转到购物车tab页
    if (url === '/pages/cart/cart') {
      wx.switchTab({ url })
      return
    }
    wx.navigateTo({ url })
  },
  
  /**
   * 跳转设计师工作台
   */
  goDesigner() {
    if (!this.data.isDesigner && !this.data.isAdmin) {
      wx.showToast({ title: '仅设计师可进入', icon: 'none' })
      return
    }
    const app = getApp()
    wx.setStorageSync('userRole', 'designer')
    if (app && app.globalData) app.globalData.userRole = 'designer'
    wx.switchTab({ url: '/pages/designer-home/designer-home' })
  },

  /**
   * 拨打电话
   */
  callPhone(e) {
    e.stopPropagation() // 阻止冒泡到 profile-card
    const phone = this.data.user.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    } else {
      wx.showToast({ title: '暂无手机号', icon: 'none' })
    }
  },

  /**
   * 联系客服 / 专属客服
   */
  onContact() { 
    wx.navigateTo({ url: '/pages/support/contact/contact' }) 
  },

  /**
   * 切换 tab 页面（用于「订单管理」跳转到购物车 tab）
   */
  goTab(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.switchTab({ url })
  },

  /**
   * 点击会员深色大卡 → 我的会员页
   */
  onViewMembership() {
    if (this.data.effectiveLevel === 'free') {
      wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })
    } else {
      wx.navigateTo({ url: '/pages/profile/membership/membership' })
    }
  },

  /**
   * 点击会员卡上的「会员权益」按钮（catchtap 防冒泡到大卡）
   */
  onMemberBenefits() {
    if (this.data.effectiveLevel === 'free') {
      wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })
    } else {
      wx.navigateTo({ url: '/pages/profile/membership/membership' })
    }
  },

  /**
   * 占位：尚未上线的会员入口（生日特权 / 会员活动 / 会员升级攻略）
   */
  onComingSoon(e) {
    const name = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.name) || '该功能'
    wx.showToast({ title: `${name} 即将上线`, icon: 'none' })
  },

  /**
   * 根据 user doc 计算会员卡展示字段
   * 字段缺失时返回兜底值（与 wxml 的 || '--' 配合显示占位）
   * @param {Object} doc 用户文档
   * @returns {Object} 可直接 spread 到 setData 的字段对象
   */
  _buildMemberFields(doc) {
    // 会员等级、等级名、有效期由 _loadMembership 异步从 membership_status 云函数加载
    // 此处仅处理与用户 doc 同步可得的字段（会员ID / 成长值 / 进度等）
    if (!doc || typeof doc !== 'object') {
      return {
        memberId: '',
        memberGrowth: '0',
        memberGrowthMax: '0',
        memberProgressPercent: 0,
        memberNextLevelTip: ''
      }
    }

    // 会员ID：优先 memberId 字段，其次 _id 末 8 位
    let memberId = doc.memberId || ''
    if (!memberId && doc._id) {
      const idStr = String(doc._id)
      memberId = idStr.length > 8 ? idStr.slice(-8) : idStr
    }

    // 成长值
    const growth = Number(doc.memberGrowth || doc.growth || 0) || 0
    const growthMax = Number(doc.memberGrowthMax || doc.growthMax || 0) || 0
    const memberGrowth = String(growth)
    const memberGrowthMax = String(growthMax)

    // 进度百分比
    let memberProgressPercent = 0
    if (growthMax > 0) {
      memberProgressPercent = Math.min(100, Math.max(0, Math.round((growth / growthMax) * 100)))
    }

    // 下一级提示
    const memberNextLevelTip = doc.memberNextLevelTip || ''

    return {
      memberId,
      memberGrowth,
      memberGrowthMax,
      memberProgressPercent,
      memberNextLevelTip
    }
  },

  /**
   * 异步加载会员状态
   * 调用 membership_status 云函数获取权威的 effectiveLevel / vipExpireAt
   * - effectiveLevel: 'free' | 'normal' | 'premium'（云函数已含过期判定）
   * - vipExpireAt: 毫秒时间戳；'free' 等级下为 null，wxml wx:if 会跳过"有效期"那行
   */
  async _loadMembership() {
    try {
      const m = await fetchMembershipStatus()
      const level = MEMBER_CARD_BG_FILE_IDS[m.effectiveLevel] ? m.effectiveLevel : 'free'
      this.setData({
        effectiveLevel: level,
        memberLevelName: VIP_LEVEL_LABELS[level],
        memberExpireDate: m.vipExpireAt ? formatExpireDate(m.vipExpireAt) : ''
      })
      this._loadMemberCardBg(level)
    } catch (err) {
      console.warn('[home] 加载会员状态失败', err)
      // 失败兜底：按 free 等级显示
      this.setData({
        effectiveLevel: 'free',
        memberLevelName: VIP_LEVEL_LABELS.free,
        memberExpireDate: ''
      })
      this._loadMemberCardBg('free')
    }
  },

  /**
   * 异步加载会员卡背景图 https 临时链接
   * - 命中缓存直接 setData
   * - 未命中时调用 wx.cloud.getTempFileURL 获取，失败时 memberCardBg 置空
   * @param {string} level 'free' | 'normal' | 'premium'
   */
  _loadMemberCardBg(level) {
    const lv = MEMBER_CARD_BG_FILE_IDS[level] ? level : 'free'
    const fileID = MEMBER_CARD_BG_FILE_IDS[lv]

    // 命中缓存
    if (_memberCardBgUrlCache[lv]) {
      if (this.data.memberCardBg !== _memberCardBgUrlCache[lv]) {
        this.setData({ memberCardBg: _memberCardBgUrlCache[lv] })
      }
      return
    }

    // 无云开发环境兜底
    if (!wx.cloud || !wx.cloud.getTempFileURL) {
      this.setData({ memberCardBg: '' })
      return
    }

    wx.cloud.getTempFileURL({ fileList: [fileID] })
      .then((res) => {
        const item = res && res.fileList && res.fileList[0]
        const url = item && item.tempFileURL
        if (url) {
          _memberCardBgUrlCache[lv] = url
          // 仅当当前等级仍是请求时的等级，才回写（避免乱序）
          if (this.data.effectiveLevel === lv) {
            this.setData({ memberCardBg: url })
          }
        } else {
          console.warn('会员卡背景图临时链接为空', item && item.errMsg)
        }
      })
      .catch((err) => {
        console.warn('获取会员卡背景图临时链接失败', err)
      })
  },

  /**
   * 异步加载四宫格统计数据：订单数、收藏数、购物车数、地址数
   * 任意字段失败均不影响其他字段，失败的保持空字符串（→ 显示 '--'）
   * @param {Object} doc 用户文档
   */
  async _loadCounts(doc) {
    if (!doc || !wx.cloud) return

    const openid = wx.getStorageSync('openid') || ''
    const userId = doc._id || ''
    if (!openid && !userId) return

    const db = wx.cloud.database()
    const _ = db.command
    const ownerWhere = openid ? { _openid: openid } : { userId }

    // 并行查询 4 个集合的 count，每一个独立 try/catch
    const tasks = [
      // 订单数
      db.collection('orders').where(ownerWhere).count()
        .then(r => ({ key: 'orderCount', val: r && typeof r.total === 'number' ? r.total : '' }))
        .catch(() => ({ key: 'orderCount', val: '' })),
      // 收藏数
      db.collection('favorites').where(ownerWhere).count()
        .then(r => ({ key: 'favCount', val: r && typeof r.total === 'number' ? r.total : '' }))
        .catch(() => ({ key: 'favCount', val: '' })),
      // 购物车数
      db.collection('mall_cart').where(ownerWhere).count()
        .then(r => ({ key: 'cartCount', val: r && typeof r.total === 'number' ? r.total : '' }))
        .catch(() => ({ key: 'cartCount', val: '' })),
      // 地址数
      db.collection('addresses').where(ownerWhere).count()
        .then(r => ({ key: 'addressCount', val: r && typeof r.total === 'number' ? r.total : '' }))
        .catch(() => ({ key: 'addressCount', val: '' }))
    ]

    try {
      const results = await Promise.all(tasks)
      const patch = {}
      results.forEach(({ key, val }) => {
        patch[key] = val === '' ? '' : String(val)
      })
      this.setData(patch)
    } catch (e) {
      console.warn('加载四宫格统计数据失败', e)
    }
  },

  /**
   * 跳转到登录页面
   */
  onGoLogin() {
    wx.navigateTo({
      url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/profile/home/home')
    })
  },

  /**
   * 转换头像 URL
   * 如果是 cloud:// fileID，需要转换为临时链接
   */
  async convertAvatarUrl(avatarUrl) {
    if (!avatarUrl) {
      this.setData({ userAvatarDisplay: '', userAvatarFileID: '' })
      return
    }

    if (avatarUrl.startsWith('cloud://')) {
      // cloud:// fileID 不能直接作为 <image> src（渲染层会把它当成相对路径导致 500）
      // 必须通过 getTempFileURL 转换为 HTTPS URL
      if (!wx.cloud || !wx.cloud.getTempFileURL) {
        // 云开发不可用，保持空（显示默认头像），不传 cloud:// 给渲染层
        this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl })
        return
      }
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
        const item = res && res.fileList && res.fileList[0]
        console.log('[home] 头像 getTempFileURL item:', item ? JSON.stringify(item) : 'null')
        const tempUrl = item && item.tempFileURL
        if (tempUrl) {
          this.setData({ userAvatarDisplay: tempUrl, userAvatarFileID: avatarUrl })
        } else {
          console.warn('[home] 头像 getTempFileURL 空链接，status:', item && item.status, 'errMsg:', item && item.errMsg)
          this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl })
        }
      } catch (e) {
        console.warn('[home] 头像 getTempFileURL 失败:', e)
        this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl })
      }
    } else {
      // http/https 或本地路径，直接使用
      this.setData({ userAvatarDisplay: avatarUrl, userAvatarFileID: '' })
    }
  },

  /**
   * 头像加载失败时的处理
   */
  onAvatarError() {
    console.warn('头像图片加载失败，降级显示默认头像')
    // cloud:// fileID 加载失败时直接降级，不再重试 getTempFileURL（会返回 500）
    this.setData({ userAvatarDisplay: '' })
  }
})
