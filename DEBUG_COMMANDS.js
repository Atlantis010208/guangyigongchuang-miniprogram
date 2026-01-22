/**
 * 调试命令集合
 * 请在微信开发者工具的 Console 中逐个执行以下命令
 */

// ========== 1. 检查本地登录状态 ==========
console.log('========== 1. 本地登录状态 ==========')
const app = getApp()
console.log('全局登录状态:', {
  isLoggedIn: app.globalData.isLoggedIn,
  openid: app.globalData.openid,
  userDoc: app.globalData.userDoc
})

// ========== 2. 检查 Storage 数据 ==========
console.log('========== 2. Storage 数据 ==========')
console.log('Storage 内容:', {
  openid: wx.getStorageSync('openid'),
  userDoc: wx.getStorageSync('userDoc'),
  loginTime: wx.getStorageSync('loginTime'),
  expireTime: wx.getStorageSync('loginExpireTime')
})

// ========== 3. 调用云函数获取详细日志 ==========
console.log('========== 3. 调用购买检查云函数 ==========')
wx.cloud.callFunction({
  name: 'course_purchase_check',
  data: { courseId: 'CO_DEFAULT_001' }
}).then(res => {
  console.log('购买检查返回（完整）:', JSON.stringify(res.result, null, 2))
}).catch(err => {
  console.error('购买检查失败:', err)
})

// ========== 4. 检查 users 集合（需要云函数帮助）==========
console.log('========== 4. 创建临时调试云函数调用 ==========')
// 创建一个临时的调试命令
wx.cloud.callFunction({
  name: 'course_purchase_check',
  data: { 
    courseId: 'CO_DEFAULT_001',
    debug: true  // 添加 debug 标志
  }
}).then(res => {
  console.log('调试信息:', res.result)
})

// ========== 5. 获取当前页面数据 ==========
console.log('========== 5. 当前页面数据 ==========')
const pages = getCurrentPages()
const currentPage = pages[pages.length - 1]
if (currentPage) {
  console.log('页面数据:', {
    route: currentPage.route,
    isPurchased: currentPage.data.isPurchased,
    progress: currentPage.data.progress,
    course: currentPage.data.course ? {
      id: currentPage.data.course.id,
      title: currentPage.data.course.title
    } : null
  })
}

// ========== 6. 强制清除所有登录信息（最后执行）==========
console.log('========== 6. 准备强制清除命令（不自动执行）==========')
console.log('如果需要强制清除，请手动执行以下命令:')
console.log(`
const app = getApp()
app.clearLoginCache()
wx.clearStorageSync()
console.log('已清除所有登录信息')
wx.reLaunch({ url: '/pages/products/products' })
`)

