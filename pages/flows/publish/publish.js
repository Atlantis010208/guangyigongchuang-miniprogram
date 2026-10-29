const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    // 表单字段
    space:'住宅', spaceOther:'',
    service:'整套灯光设计',
    budget:'¥19/m²', budgetOther:'',
    area:'',
    stage:'未开始',
    share:'愿意',
    coCreate:'愿意',
    images: [], // [{ tempPath, size, sizeText, fileID, cloudPath, uploaded, error }]
    files: [],  // [{ path, name, ext, size, sizeText, fileID, cloudPath, uploaded, error }]
    submitting:false,
    
    // 分步表单状态
    keyboardHeight: 0,
    currentStep: 0,
    isNextValid: false,
    areaFocus: false,
    steps: [
      {
        id: 'space',
        title: '01 空间类型',
        subtitle: '',
        type: 'choice',
        options: ['住宅', '商铺', '办公室', '其他'],
      },
      {
        id: 'service',
        title: '02 需要什么服务？',
        subtitle: '根据个人需求选择',
        type: 'choice',
        options: ['整套灯光设计', '只深化灯光施工图', '选灯配灯服务'],
      },
      {
        id: 'budget',
        title: '03 设计预算',
        subtitle: '整套灯光根据你的预算匹配对应的设计师，最低价格不低于9元/平，预算越高将匹配到更有经验的共创设计师',
        type: 'choice',
        options: ['¥5/m²（只针对选灯配灯）', '¥9/m²', '¥16/m²', '¥19/m²', '¥29/m²', '¥39/m²', '¥50/m²及以上', '其他'],
      },
      {
        id: 'area',
        title: '04 设计面积',
        subtitle: '根据你家大概面积进行填写，只填写需要设计的面积。面积低于50平按50平收费！',
        type: 'input',
        inputLabel: '面积(m²)',
        inputPlaceholder: '请输入数字',
      },
      {
        id: 'stage',
        title: '05 项目进度',
        subtitle: '',
        type: 'choice',
        options: ['未开始', '正在设计', '装修中', '已完成装修'],
      },
      {
        id: 'share',
        title: '06 愿意分享你家的装修故事换取折扣吗？',
        subtitle: '',
        type: 'choice',
        options: ['愿意', '不愿意'],
      },
      {
        id: 'coCreate',
        title: '07 愿意跟设计师共创你的设计吗？',
        subtitle: '',
        type: 'choice',
        options: ['愿意', '不愿意'],
      },
      {
        id: 'attachments',
        title: '08 上传户型图（选填）',
        subtitle: '上传户型图片或图纸文件，方便设计师快速理解你的需求；图片可拍照或从相册选择，pdf / dwg / dxf 等文件请先发送到微信（如文件传输助手）后再选择',
        type: 'upload',
      }
    ]
  },

  onLoad(){
    // 读取首页测算预填
    const prefill = wx.getStorageSync('publish_prefill')
    if (prefill){
      const data = {}
      if (prefill.space) data.space = prefill.space
      if (prefill.service) data.service = prefill.service
      if (prefill.budget) data.budget = prefill.budget
      if (prefill.area) data.area = prefill.area
      this.setData(data)
      wx.removeStorageSync('publish_prefill')
    }
    this.checkNextValid()
  },

  // ========== 键盘高度监听 ==========
  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 })
  },

  // ========== 分步交互逻辑 ==========
  checkNextValid() {
    const step = this.data.steps[this.data.currentStep]
    let valid = false
    if (step.type === 'choice') {
      const val = this.data[step.id]
      if (val) {
        if (val === '其他') {
          valid = !!(this.data[step.id + 'Other'] && this.data[step.id + 'Other'].trim())
        } else {
          valid = true
        }
      }
    } else if (step.type === 'input') {
      valid = !!(this.data[step.id] && String(this.data[step.id]).trim())
    } else if (step.type === 'upload') {
      // 上传步骤选填，始终允许进入下一步/提交
      valid = true
    }
    this.setData({ isNextValid: valid })
  },

  handleOptionSelect(e) {
    const { id, option } = e.currentTarget.dataset
    this.setData({ [id]: option }, () => {
      this.checkNextValid()
      
      // 如果不是选择了"其他"，且不是最后一题，直接自动下一步
      if (option !== '其他' && this.data.currentStep < this.data.steps.length - 1) {
        if (this._nextTimer) clearTimeout(this._nextTimer)
        this._nextTimer = setTimeout(() => {
          this.handleNext()
        }, 300)
      }
    })
  },

  handleOtherInput(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ [id + 'Other']: e.detail.value }, () => {
      this.checkNextValid()
    })
  },

  handleOtherConfirm(e) {
    this.setData({ keyboardHeight: 0 })
  },

  handleNumberInput(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ [id]: e.detail.value }, () => {
      this.checkNextValid()
    })
  },

  handleNumberConfirm(e) {
    this.setData({ keyboardHeight: 0 })
  },

  // ========== 上传：图片 ==========
  onChooseImages() {
    const remaining = 9 - (this.data.images || []).length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传 9 张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = (res.tempFiles || []).map((f) => {
          const sizeBytes = f.size || 0
          const sizeText = sizeBytes >= 1024 * 1024
            ? (sizeBytes / 1024 / 1024).toFixed(2) + 'MB'
            : Math.max(1, Math.round(sizeBytes / 1024)) + 'KB'
          return {
            tempPath: f.tempFilePath,
            size: sizeBytes,
            sizeText,
            fileID: '',
            cloudPath: '',
            uploaded: false,
            error: false
          }
        })
        if (!newImages.length) return
        this.setData({ images: (this.data.images || []).concat(newImages) }, () => {
          newImages.forEach((img) => this._uploadImage(img.tempPath))
        })
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return
        console.error('选择图片失败', err)
        wx.showToast({ title: '选择图片失败', icon: 'none' })
      }
    })
  },

  _uploadImage(tempPath) {
    const cur = this.data.images || []
    const idx = cur.findIndex((it) => it.tempPath === tempPath)
    if (idx === -1) return
    const img = cur[idx]
    const ext = (String(tempPath).split('.').pop() || 'jpg').toLowerCase().slice(0, 8)
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const cloudPath = `publish/images/${ts}_${rand}.${ext}`
    wx.cloud.uploadFile({
      cloudPath,
      filePath: img.tempPath,
      success: (r) => {
        const list = (this.data.images || []).slice()
        const i = list.findIndex((it) => it.tempPath === tempPath)
        if (i === -1) return
        list[i] = Object.assign({}, list[i], { fileID: r.fileID, cloudPath, uploaded: true, error: false })
        this.setData({ images: list })
      },
      fail: (err) => {
        console.error('图片上传失败', err)
        const list = (this.data.images || []).slice()
        const i = list.findIndex((it) => it.tempPath === tempPath)
        if (i === -1) return
        list[i] = Object.assign({}, list[i], { error: true })
        this.setData({ images: list })
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      }
    })
  },

  onRemoveImage(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(idx)) return
    const list = (this.data.images || []).slice()
    if (idx < 0 || idx >= list.length) return
    list.splice(idx, 1)
    this.setData({ images: list })
  },

  onRetryImage(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(idx)) return
    const cur = this.data.images || []
    const img = cur[idx]
    if (!img) return
    const list = cur.slice()
    list[idx] = Object.assign({}, img, { error: false })
    this.setData({ images: list }, () => this._uploadImage(img.tempPath))
  },

  // ========== 上传：图纸文件 ==========
  onChooseFiles() {
    const remaining = 5 - (this.data.files || []).length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传 5 个文件', icon: 'none' })
      return
    }
    const allowedExt = ['pdf', 'dwg', 'dxf', 'doc', 'docx', 'xlsx']
    wx.chooseMessageFile({
      count: remaining,
      type: 'file',
      extension: allowedExt,
      success: (res) => {
        const valid = []
        const invalid = []
        ;(res.tempFiles || []).forEach((f) => {
          const name = f.name || '文件'
          const ext = (name.split('.').pop() || '').toLowerCase()
          if (allowedExt.indexOf(ext) === -1) { invalid.push(name); return }
          const sizeBytes = f.size || 0
          const sizeText = sizeBytes >= 1024 * 1024
            ? (sizeBytes / 1024 / 1024).toFixed(2) + 'MB'
            : Math.max(1, Math.round(sizeBytes / 1024)) + 'KB'
          valid.push({
            path: f.path,
            name,
            ext,
            size: sizeBytes,
            sizeText,
            fileID: '',
            cloudPath: '',
            uploaded: false,
            error: false
          })
        })
        if (invalid.length) {
          wx.showToast({ title: `不支持：${invalid[0]}`, icon: 'none' })
        }
        if (!valid.length) return
        this.setData({ files: (this.data.files || []).concat(valid) }, () => {
          valid.forEach((f) => this._uploadFile(f.path))
        })
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return
        console.error('选择文件失败', err)
        wx.showToast({ title: '选择文件失败', icon: 'none' })
      }
    })
  },

  _uploadFile(path) {
    const cur = this.data.files || []
    const idx = cur.findIndex((it) => it.path === path)
    if (idx === -1) return
    const f = cur[idx]
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const safeName = String(f.name || 'file').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
    const cloudPath = `publish/files/${ts}_${rand}_${safeName}`
    wx.cloud.uploadFile({
      cloudPath,
      filePath: f.path,
      success: (r) => {
        const list = (this.data.files || []).slice()
        const i = list.findIndex((it) => it.path === path)
        if (i === -1) return
        list[i] = Object.assign({}, list[i], { fileID: r.fileID, cloudPath, uploaded: true, error: false })
        this.setData({ files: list })
      },
      fail: (err) => {
        console.error('文件上传失败', err)
        const list = (this.data.files || []).slice()
        const i = list.findIndex((it) => it.path === path)
        if (i === -1) return
        list[i] = Object.assign({}, list[i], { error: true })
        this.setData({ files: list })
        wx.showToast({ title: '文件上传失败', icon: 'none' })
      }
    })
  },

  onRemoveFile(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(idx)) return
    const list = (this.data.files || []).slice()
    if (idx < 0 || idx >= list.length) return
    list.splice(idx, 1)
    this.setData({ files: list })
  },

  onRetryFile(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(idx)) return
    const cur = this.data.files || []
    const f = cur[idx]
    if (!f) return
    const list = cur.slice()
    list[idx] = Object.assign({}, f, { error: false })
    this.setData({ files: list }, () => this._uploadFile(f.path))
  },

  _applyStepSideEffects() {
    const step = this.data.steps[this.data.currentStep]
    if (step && step.type === 'input') {
      // 切换到输入步骤时，自动聚焦弹出键盘
      this.setData({ areaFocus: false }, () => {
        setTimeout(() => this.setData({ areaFocus: true }), 50)
      })
    } else if (this.data.areaFocus) {
      this.setData({ areaFocus: false })
    }
  },

  handlePrev() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 }, () => {
        this.checkNextValid()
        this._applyStepSideEffects()
      })
    }
  },

  handleNext() {
    if (!this.data.isNextValid) return
    const now = Date.now()
    if (this._lastNextTime && now - this._lastNextTime < 400) return
    this._lastNextTime = now
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1 }, () => {
        this.checkNextValid()
        this._applyStepSideEffects()
      })
    }
  },

  onSubmit(){
    if (this.data.submitting || this._submitting) return
    
    // 检查登录状态 - 提交需求需要登录
    const app = getApp()
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '提交照明需求需要登录，是否前往登录？',
        confirmText: '去登录',
        cancelText: '暂不提交',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/flows/publish/publish')
            })
          }
        }
      })
      return
    }

    // 同步校验表单
    const space = this.data.space==='其他' ? (this.data.spaceOther||'其他') : this.data.space
    const budget = this.data.budget==='其他' ? (this.data.budgetOther||'其他') : this.data.budget
    if(!space){ wx.showToast({ title:'请选择空间类型', icon:'none' }); return }
    if(!this.data.service){ wx.showToast({ title:'请选择服务类型', icon:'none' }); return }
    if(!budget){ wx.showToast({ title:'请选择预算', icon:'none' }); return }
    if(!this.data.area){ wx.showToast({ title:'请输入设计面积', icon:'none' }); return }
    if(!this.data.stage){ wx.showToast({ title:'请选择项目进度', icon:'none' }); return }

    // 检查附件上传状态：仍在上传 / 上传失败时阻止提交
    const uploadingImg = (this.data.images || []).find((img) => !img.uploaded && !img.error)
    const uploadingFile = (this.data.files || []).find((f) => !f.uploaded && !f.error)
    if (uploadingImg || uploadingFile) {
      wx.showToast({ title: '附件还在上传中，请稍候', icon: 'none' })
      return
    }
    const errorImg = (this.data.images || []).find((img) => img.error)
    const errorFile = (this.data.files || []).find((f) => f.error)
    if (errorImg || errorFile) {
      wx.showToast({ title: '有附件上传失败，请删除或重试', icon: 'none' })
      return
    }

    // 校验通过后，立即同步调用订阅弹窗（必须在用户点击同步上下文中）
    // 同时订阅：接单通知 + 订单完成通知
    const tmplIds = [
      'bxor0x4ZJ_JoEnPct2ieOYRzGWrM2imsmrZtiX5NHE0',
      'f9PDbOaLcS43cOSGq2rkto8q5Ik4gxzBT7RAtorK8GI'
    ]
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      complete: () => {
        // 无论用户允许/拒绝/关闭，都继续执行提交
        wx.showLoading({ title: '提交中...', mask: true })
        this._doSubmit(space, budget)
      }
    })
  },

  async _doSubmit(space, budget){
    this._submitting = true
    this.setData({ submitting: true })

    // 查询云端押金状态，用于优先服务标记
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
    const userIdLocal = (userDoc && userDoc._id) ? userDoc._id : null

    // 收集已上传成功的附件
    const imageFileIDs = (this.data.images || [])
      .filter((img) => img.uploaded && img.fileID)
      .map((img) => img.fileID)
    const fileAttachments = (this.data.files || [])
      .filter((f) => f.uploaded && f.fileID)
      .map((f) => ({ name: f.name, size: f.size, ext: f.ext, fileID: f.fileID }))

    const id = Date.now().toString()
    const req = {
      id,
      space,
      service: this.data.service,
      budget,
      area: this.data.area,
      stage: this.data.stage,
      share: this.data.share,
      coCreate: this.data.coCreate,
      images: imageFileIDs,
      files: fileAttachments,
      createdAt: new Date().toISOString(),
      source: 'publish',
      priority: depositPaid,
      status: 'submitted',
      userId: userIdLocal,
      steps: [
        { key:'submitted', label:'已提交', done:true },
        { key:'review', label:'审核中', done:false },
        { key:'design', label:'设计中', done:false },
        { key:'done', label:'已完成', done:false }
      ]
    }
    // 云端保存：requests + orders
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        const params = { space, service: this.data.service, budget, area: this.data.area, stage: this.data.stage, coCreate: this.data.coCreate, share: this.data.share, images: imageFileIDs, files: fileAttachments }
        try{
          const r1 = await util.callCf('requests_create', { request: { orderNo: id, category: 'publish', params, userId, status: 'submitted', priority: depositPaid } })
          if (!r1 || !r1.success) throw new Error((r1 && r1.errorMessage) || 'requests_create failed')
        }catch(err){
          const msg = (err && (err.message || err.errMsg)) || ''
          if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
            if (wx.cloud && wx.cloud.callFunction) {
              await wx.cloud.callFunction({ name: 'initCollections' }).catch(()=>{})
              await util.callCf('requests_create', { request: { orderNo: id, category: 'publish', params, userId, status: 'submitted', priority: depositPaid } }).catch(()=>{})
            }
          }
        }
        util.callCf('orders_create', { order: { type: 'products', orderNo: id, category: 'publish', params, status: 'submitted', paid: false, userId, priority: depositPaid } }).catch(()=>{})
      }
    }catch(err){}
    wx.hideLoading()
    wx.showToast({ title:'已提交', icon:'success' })
    // 标记订单管理页切换到"共创订单"tab
    try { wx.setStorageSync('cart_switch_to_scheme', true) } catch(e) {}
    setTimeout(()=>{ wx.navigateTo({ url:'/pages/profile/orders/orders' }); this._submitting = false; this.setData({ submitting:false }) }, 400)
  }
})
