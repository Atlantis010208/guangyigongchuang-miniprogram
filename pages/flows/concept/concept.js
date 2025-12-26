const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{ imgs:[] },
  onUpload(){
    wx.chooseImage({ count: 6, success: (res)=>{
      this.setData({ imgs: this.data.imgs.concat(res.tempFilePaths).slice(0,6) })
    }})
  },
  async onApply(){
    // 登录检查：未登录时跳转登录页
    const app = getApp()
    if (!app.requireLogin(true, '/pages/flows/concept/concept')) {
      return // 未登录，阻止提交并跳转登录页
    }
    
    // 查询云端押金状态
    let depositPaid = false
    try {
      const depositRes = await wx.cloud.callFunction({ name: 'deposit_query' })
      if (depositRes.result && depositRes.result.code === 0) {
        depositPaid = depositRes.result.data.hasPaid === true
      }
      console.log('押金状态:', depositPaid ? '已缴纳' : '未缴纳')
    } catch (err) {
      console.warn('查询押金状态失败，使用默认值:', err)
    }
    
    const userDoc = wx.getStorageSync('userDoc') || {}
    const userId = (userDoc && userDoc._id) ? userDoc._id : null
    const id = Date.now().toString()
    
    // 云端保存：requests + orders
    try{
      const db = api.dbInit()
      if (db) {
        const params = { 
          space: '概念方案',
          target: '提交概念方案申请',
          note: `参考图数量:${this.data.imgs.length}`,
          imgs: this.data.imgs
        }
        
        try{
          const r1 = await util.callCf('requests_create', { 
            request: { 
              orderNo: id, 
              category: 'concept', 
              params, 
              userId, 
              status: 'submitted', 
              priority: depositPaid 
            } 
          })
          if (!r1 || !r1.success) throw new Error((r1 && r1.errorMessage) || 'requests_create failed')
        }catch(err){
          const msg = (err && (err.message || err.errMsg)) || ''
          if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
            if (wx.cloud && wx.cloud.callFunction) {
              await wx.cloud.callFunction({ name: 'initCollections' }).catch(()=>{})
              await util.callCf('requests_create', { 
                request: { 
                  orderNo: id, 
                  category: 'concept', 
                  params, 
                  userId, 
                  status: 'submitted', 
                  priority: depositPaid 
                } 
              }).catch(()=>{})
            }
          }
        }
        
        util.callCf('orders_create', { 
          order: { 
            type: 'products', 
            orderNo: id, 
            category: 'concept', 
            params, 
            status: 'submitted', 
            paid: false, 
            userId, 
            priority: depositPaid 
          } 
        }).catch(()=>{})
      }
    }catch(err){
      console.error('保存到云数据库失败:', err)
    }
    
    wx.showToast({ title:'已提交', icon:'success' })
    setTimeout(()=>{ wx.switchTab({ url:'/pages/cart/cart' }) }, 400)
  }
})


