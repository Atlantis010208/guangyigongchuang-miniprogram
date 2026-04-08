Page({
  data: {
    user: {
      avatar: '',
      name: '',
      bio: '',
      experience: '',
      styles: '',
      phone: '',
      wechat: ''
    },
    pendingAvatarPath: '',  // 待上传的本地头像路径
    saving: false
  },

  onLoad(options) {
    this.loadUserData();
  },

  // 加载设计师档案
  loadUserData() {
    wx.showLoading({ title: '加载中...', mask: true });
    wx.cloud.callFunction({
      name: 'designer_profile',
      data: { action: 'get' },
      success: (res) => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          const d = res.result.data;
          this.setData({
            user: {
              avatar: d.tempAvatarUrl || d.avatar || '',
              name: d.name || '',
              bio: d.bio || '',
              experience: d.experience !== undefined ? String(d.experience) : '',
              styles: d.styles || '',
              phone: d.phone || '',
              wechat: d.wechat || ''
            }
          });
        } else {
          wx.showToast({ title: res.result ? res.result.message : '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('[designer-profile-edit] 加载失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 处理输入框修改
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`user.${field}`]: value });
  },

  // 点击更换头像：先选图，预览，待保存时再上传
  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          'user.avatar': tempFilePath,
          pendingAvatarPath: tempFilePath
        });
      }
    });
  },

  // 上传头像到云存储，返回 fileID
  uploadAvatar(tempFilePath) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const ext = tempFilePath.split('.').pop() || 'jpg';
      wx.cloud.uploadFile({
        cloudPath: `designer-avatars/${timestamp}.${ext}`,
        filePath: tempFilePath,
        success: (res) => resolve(res.fileID),
        fail: reject
      });
    });
  },

  // 点击保存
  async onSave() {
    const { user, pendingAvatarPath, saving } = this.data;
    if (saving) return;

    if (!user.name || !user.name.trim()) {
      wx.showToast({ title: '姓名不能为空', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const updateData = {
        name: user.name.trim(),
        bio: user.bio || '',
        experience: parseInt(user.experience) || 0,
        styles: user.styles || '',
        phone: user.phone || '',
        wechat: user.wechat || ''
      };

      // 如果有新头像，先上传
      if (pendingAvatarPath) {
        const fileID = await this.uploadAvatar(pendingAvatarPath);
        updateData.avatarUrl = fileID;
      }

      wx.cloud.callFunction({
        name: 'designer_profile',
        data: { action: 'update', updateData },
        success: (res) => {
          wx.hideLoading();
          this.setData({ saving: false, pendingAvatarPath: '' });
          if (res.result && res.result.success) {
            wx.showToast({ title: '保存成功', icon: 'success', duration: 1500 });
            setTimeout(() => wx.navigateBack(), 1500);
          } else {
            wx.showToast({ title: res.result ? res.result.message : '保存失败', icon: 'none' });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          this.setData({ saving: false });
          console.error('[designer-profile-edit] 保存失败:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      console.error('[designer-profile-edit] 头像上传失败:', err);
      wx.showToast({ title: '头像上传失败，请重试', icon: 'none' });
    }
  }
});
