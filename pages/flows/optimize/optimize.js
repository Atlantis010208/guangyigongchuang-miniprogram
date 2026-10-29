const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    files:[],
    serviceWeChat:'gy-lighting',
    needs:[],
    deliverables:[],
    note:'',
    submitting:false,
    depositStatus: 'unknown', // unknown/unpaid/paid
    depositChecking: false
  },

  onLoad() {
    // 页面加载时预查询押金状态
    this.checkDepositStatus()
  },

  onShow() {
    // 每次显示页面时刷新押金状态（可能从押金页面返回）
    this.checkDepositStatus()
  },

  /**
   * 查询押金状态
   */
  async checkDepositStatus() {
    try {
      this.setData({ depositChecking: true })
      const res = await wx.cloud.callFunction({
        name: 'deposit_query'
      })
      
      if (res.result && res.result.code === 0) {
        const { status } = res.result.data
        // 更新押金状态
        this.setData({ 
          depositStatus: status,
          depositChecking: false
        })
        // 同步更新本地存储
        if (status === 'paid') {
          wx.setStorageSync('deposit_paid', true)
        }
        console.log('押金状态:', status)
      } else {
        this.setData({ depositChecking: false })
      }
    } catch (error) {
      console.warn('查询押金状态失败:', error)
      this.setData({ depositChecking: false })
    }
  },

  onChooseFile(){
    const that = this
    wx.chooseMessageFile({
      count: 6,
      type: 'file',
      success(res){
        const picked = (res.tempFiles||[]).map(f=>{
          const sizeMb = f.size/1024/1024
          return { 
            path: f.path, 
            name: f.name || '文件', 
            size: f.size, 
            sizeText: sizeMb.toFixed(2) + 'MB',
            uploaded: false,  // 标记是否已上传
            fileID: ''        // 云存储文件ID
          }
        })
        that.setData({ files: picked })
      }
    })
  },

  /**
   * 上传文件到云存储
   * @param {object} file - 文件对象
   * @param {string} orderNo - 订单号
   * @returns {Promise<string>} - 返回云存储 fileID
   */
  async uploadFileToCloud(file, orderNo) {
    return new Promise((resolve, reject) => {
      // 获取文件扩展名
      const ext = file.name.split('.').pop() || 'file'
      // 生成云端路径：optimize/订单号/时间戳_文件名
      const cloudPath = `optimize/${orderNo}/${Date.now()}_${file.name}`
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: file.path,
        success: (res) => {
          console.log('文件上传成功:', res.fileID)
          resolve(res.fileID)
        },
        fail: (err) => {
          console.error('文件上传失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 批量上传所有文件
   * @param {string} orderNo - 订单号
   * @returns {Promise<Array>} - 返回上传后的文件信息数组
   */
  async uploadAllFiles(orderNo) {
    const uploadedFiles = []
    const files = this.data.files
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      wx.showLoading({ 
        title: `上传文件 ${i + 1}/${files.length}...`,
        mask: true
      })
      
      try {
        const fileID = await this.uploadFileToCloud(file, orderNo)
        uploadedFiles.push({
          name: file.name,
          size: file.size,
          sizeText: file.sizeText,
          fileID: fileID,
          cloudPath: `optimize/${orderNo}/${Date.now()}_${file.name}`
        })
      } catch (err) {
        wx.hideLoading()
        throw new Error(`文件 "${file.name}" 上传失败`)
      }
    }
    
    wx.hideLoading()
    return uploadedFiles
  },
  onNeedsChange(e){ this.setData({ needs: e.detail.value }) },
  onDeliverablesChange(e){ this.setData({ deliverables: e.detail.value }) },
  onNote(e){ this.setData({ note: e.detail.value }) },

  async onSubmit(){
    // 登录检查：未登录时跳转登录页
    const app = getApp()
    if (!app.requireLogin(true, '/pages/flows/optimize/optimize')) {
      return // 未登录，阻止提交并跳转登录页
    }
    if (this.data.submitting || this._submitting) return
    
    const userDoc = wx.getStorageSync('userDoc') || {}
    const userIdLocal = (userDoc && userDoc._id) ? userDoc._id : null

    // 实时查询押金状态
    let depositPaid = this.data.depositStatus === 'paid'
    
    // 如果状态未知或正在检查，先等待查询结果
    if (this.data.depositStatus === 'unknown' || this.data.depositChecking) {
      wx.showLoading({ title: '检查押金状态...' })
      try {
        const res = await wx.cloud.callFunction({
          name: 'deposit_query'
        })
        wx.hideLoading()
        
        if (res.result && res.result.code === 0) {
          const { status } = res.result.data
          this.setData({ depositStatus: status })
          depositPaid = (status === 'paid')
          if (depositPaid) {
            wx.setStorageSync('deposit_paid', true)
          }
        }
      } catch (error) {
        wx.hideLoading()
        console.warn('查询押金状态失败:', error)
        // 查询失败时，使用本地缓存作为降级方案
        depositPaid = !!wx.getStorageSync('deposit_paid')
      }
    }

    // 如果押金未缴纳，显示提示弹窗
    if (!depositPaid) {
      wx.showModal({
        title:'温馨提示',
        content:'发布需求前需缴纳¥100押金，订单完成后自动原路退回。是否前往缴纳并查看押金规则？',
        cancelText:'稍后',
        confirmText:'前往押金',
        success:(r)=>{ if(r.confirm){ wx.navigateTo({ url:'/pages/profile/deposit/deposit' }) } }
      })
      return
    }

    // 押金已缴纳，继续验证表单
    if(!this.data.files.length){ wx.showToast({ title:'请先上传图纸文件', icon:'none' }); return }
    const totalSize = this.data.files.reduce((s,f)=>s+f.size,0)
    const totalMb = totalSize/1024/1024
    if(totalMb > 20){
      wx.showModal({
        title:'文件较大',
        content:`当前选择的文件总大小约为 ${totalMb.toFixed(1)}MB，建议添加客服微信（${this.data.serviceWeChat}）进行专人对接。是否复制微信号？`,
        confirmText:'复制微信号',
        cancelText:'取消',
        success:(r)=>{
          if(r.confirm){
            wx.setClipboardData({ data: this.data.serviceWeChat, success: ()=>{
              wx.showToast({ title:'已复制', icon:'success' })
            } })
          }
        }
      })
      return
    }

    const id = Date.now().toString()
    this._submitting = true
    this.setData({ submitting: true })

    // 🔥 先上传文件到云存储
    let uploadedFiles = []
    try {
      uploadedFiles = await this.uploadAllFiles(id)
      console.log('所有文件上传完成:', uploadedFiles)
    } catch (err) {
      this._submitting = false
      this.setData({ submitting: false })
      wx.showToast({ title: err.message || '文件上传失败', icon: 'none' })
      return
    }

    // 生成单行摘要（不换行）
    const joinOrDash = (arr)=> (arr && arr.length) ? arr.join('/') : '-'
    const compactNote = (this.data.note||'').replace(/\s+/g,' ')
    const target = [
      `方向:${joinOrDash(this.data.needs)}`,
      `交付:${joinOrDash(this.data.deliverables)}`,
      compactNote ? `备注:${compactNote}` : ''
    ].filter(Boolean).join(' · ')
    const req = {
      id,
      space: '灯光施工图优化',
      target,
      files: uploadedFiles, // 🔥 使用上传后的文件信息（包含 fileID）
      
      needs: this.data.needs,
      deliverables: this.data.deliverables,
      note: this.data.note,
      createdAt: new Date().toISOString(),
      source: 'optimize',
      priority: depositPaid,
      status: 'submitted',
      userId: userIdLocal,
      steps: [
        { key:'submitted', label:'已提交', done:true },
        { key:'review', label:'审核中', done:false },
        { key:'design', label:'优化中', done:false },
        { key:'done', label:'已完成', done:false }
      ]
    }
    // 云端保存：requests + orders
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        // 🔥 params 中包含带 fileID 的文件列表
        const params = { 
          target, 
          files: uploadedFiles, // 包含 fileID
          needs: this.data.needs, 
          deliverables: this.data.deliverables, 
          note: this.data.note 
        }
        util.callCf('requests_create', { request: { orderNo: id, category: 'optimize', params, userId, status: 'submitted', priority: depositPaid } })
          .catch(err => {
            const msg = (err && (err.message || err.errMsg)) || ''
            if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
              if (wx.cloud && wx.cloud.callFunction) {
                wx.cloud.callFunction({ name: 'initCollections' }).then(() => {
                  util.callCf('requests_create', { request: { orderNo: id, category: 'optimize', params, userId, status: 'submitted', priority: depositPaid } }).catch(()=>{})
                }).catch(()=>{})
              }
            }
          })
        util.callCf('orders_create', { order: { type:'products', orderNo: id, category:'optimize', params, status:'submitted', paid:false, userId, priority: depositPaid } })
          .catch(()=>{})
      }
    }catch(err){}
    
    wx.showToast({ title: '提交成功', icon: 'success' })
    setTimeout(() => {
      wx.navigateTo({ url:'/pages/profile/orders/orders' })
    }, 1000)
    this._submitting = false
    this.setData({ submitting:false })
  }
})
