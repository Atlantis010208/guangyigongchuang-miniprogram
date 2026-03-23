const app = getApp();

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
    // 保存初始数据用于判断是否有修改
    initialUser: null
  },

  onLoad(options) {
    this.loadUserData();
  },

  // 加载用户数据
  loadUserData() {
    // 模拟从全局或者本地存储读取数据
    // 这里为了演示 UI，先填充假数据，后续可以接入真实的云数据库读取
    const dummyData = {
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDlt_6-cZUO6qjroX1AXEu-wtMYE02ryL-K4rHCfhgcBWl55SjnQ46sUbkWeY4myh6udonIinxC2kl40TgyNm_lLLjoGi6S-BBYVGs9_IZJIDvhv1ibdkNpIiJ_aNMgrG_ARvgXTUAoAOL5y2SK7-qeY4P8aM8PF4fg2E1zkN97ZE-APv59lMyAfXyJUG2-cT1LLm51JH1CsxHy2qoymF9TPYgd1Rbi4sYkJ4OfvF4rMvr3XTifGmiZhOmXcnxjKDy2IECJ9hvAcFc',
      name: '张伟',
      bio: '资深灯光设计师，专注室内照明与光影美学。',
      experience: '8',
      styles: '现代简约, 商业照明, 艺术装置',
      phone: '13800138000',
      wechat: 'zhangwei_lighting'
    };

    // 如果全局有真实数据，优先使用真实数据（可根据实际数据结构调整）
    const userDoc = app.globalData.userDoc || wx.getStorageSync('userDoc');
    if (userDoc && userDoc.name) {
      dummyData.name = userDoc.name;
      // 其他字段如果数据库有也可以替换
    }

    this.setData({
      user: dummyData,
      initialUser: { ...dummyData }
    });
  },

  // 处理输入框修改
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`user.${field}`]: value
    });
  },

  // 点击更换头像
  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          'user.avatar': tempFilePath
        });
        // 实际业务中这里可能需要先上传到云存储，然后再更新 avatar 字段
      }
    });
  },

  // 点击保存
  onSave() {
    const { user } = this.data;
    
    // 简单的表单校验
    if (!user.name.trim()) {
      wx.showToast({ title: '姓名不能为空', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '保存中...', mask: true });
    
    // 模拟网络请求保存数据
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 1500,
        success: () => {
          // 这里可以更新全局数据或者缓存
          // app.globalData.userDoc = { ...app.globalData.userDoc, ...user };
          
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    }, 800);
  }
});
