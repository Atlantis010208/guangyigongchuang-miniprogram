Page({
  data: {
    nickname: '',
    phone: '',
    avatarUrl: '',
    avatarFileID: '',
    openid: '',
    userId: '',
    saving: false
  },

  onLoad() {
    const userDoc = wx.getStorageSync('userDoc') || {}
    const openid = wx.getStorageSync('openid') || ''
    this.setData({
      openid: openid,
      userId: userDoc && userDoc._id ? userDoc._id : '',
      nickname: userDoc && userDoc.nickname ? userDoc.nickname : (userDoc && userDoc.nickName ? userDoc.nickName : ''),
      phone: userDoc && userDoc.phoneNumber ? userDoc.phoneNumber : '',
      avatarUrl: userDoc && userDoc.avatarUrl ? userDoc.avatarUrl : ''
    })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  async chooseAvatar() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
      if (!res || !res.tempFiles || !res.tempFiles.length) return
      const tempPath = res.tempFiles[0].tempFilePath
      // 上传到云存储
      if (!wx.cloud) {
        this.setData({ avatarUrl: tempPath })
        return
      }
      const cloudPath = `avatars/${this.data.openid || 'unknown'}-${Date.now()}.jpg`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
      if (uploadRes && uploadRes.fileID) {
        this.setData({ avatarUrl: uploadRes.fileID, avatarFileID: uploadRes.fileID })
      } else {
        this.setData({ avatarUrl: tempPath })
      }
    } catch (err) {
      console.error('选择/上传头像失败', err)
      wx.showToast({ title: '头像选择失败', icon: 'none' })
    }
  },

  async onGetPhoneNumber(e) {
    try {
      const detail = e && e.detail
      if (!detail || detail.errMsg.indexOf('ok') === -1) {
        wx.showToast({ title: detail && detail.errMsg ? detail.errMsg : '未授权手机号', icon: 'none' })
        return
      }
      if (!detail.code) {
        wx.showToast({ title: '缺少授权码', icon: 'none' })
        return
      }
      if (!wx.cloud) {
        wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
        return
      }
      const res = await wx.cloud.callFunction({ name: 'getPhoneNumber', data: { code: detail.code } })
      if (res && res.result && res.result.success) {
        const phoneInfo = res.result.phoneInfo
        if (phoneInfo && phoneInfo.phoneNumber) {
          const phoneNumber = phoneInfo.phoneNumber
          this.setData({ phone: phoneNumber })
          try {
            const db = wx.cloud.database()
            const userId = this.data.userId
            const openid = this.data.openid
            if (userId) {
              await db.collection('users').doc(userId).update({ data: { phoneNumber } })
            } else if (openid) {
              const exist = await db.collection('users').where({ _openid: openid }).limit(1).get()
              if (exist && exist.data && exist.data.length) {
                await db.collection('users').doc(exist.data[0]._id).update({ data: { phoneNumber } })
                this.setData({ userId: exist.data[0]._id })
              }
            }
            const userDoc = wx.getStorageSync('userDoc') || {}
            const newDoc = Object.assign({}, userDoc, { phoneNumber })
            try { wx.setStorageSync('userDoc', newDoc) } catch (e) {}
          } catch (_) {}
          wx.showToast({ title: '已获取手机号', icon: 'success' })
        }
      } else {
        wx.showToast({ title: '手机号获取失败', icon: 'none' })
      }
    } catch (err) {
      console.error('获取手机号失败', err)
      wx.showToast({ title: '手机号获取失败', icon: 'none' })
    }
  },

  async onSave() {
    if (this.data.saving) return
    const { nickname, phone, avatarUrl, userId } = this.data
    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!phone || !phone.trim()) {
      wx.showToast({ title: '请获取手机号', icon: 'none' })
      return
    }
    if (!wx.cloud) {
      wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const db = wx.cloud.database()
      if (userId) {
        await db.collection('users').doc(userId).update({ data: {
          nickname: nickname,
          phoneNumber: phone,
          avatarUrl: avatarUrl
        } })
      } else {
        // 兜底：未拿到用户文档 ID 时按 openid upsert（正常不会发生）
        const openid = this.data.openid
        const exist = await db.collection('users').where({ _openid: openid }).limit(1).get()
        if (exist && exist.data && exist.data.length) {
          await db.collection('users').doc(exist.data[0]._id).update({ data: {
            nickname: nickname,
            phoneNumber: phone,
            avatarUrl: avatarUrl
          } })
        }
      }

      // 更新本地缓存
      const userDoc = wx.getStorageSync('userDoc') || {}
      const newDoc = Object.assign({}, userDoc, { nickname, phoneNumber: phone, avatarUrl })
      try { wx.setStorageSync('userDoc', newDoc) } catch (e) {}

      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => { wx.reLaunch({ url: '/pages/products/products' }) }, 800)
    } catch (err) {
      console.error('保存资料失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})




