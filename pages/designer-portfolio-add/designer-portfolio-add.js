Page({
  data: {
    coverImage: '',
    projectName: '',
    spaceTypes: ['住宅', '商业', '办公', '艺术装置', '景观'],
    spaceTypeIndex: -1,
    description: '',
    galleryImages: []
  },

  // 输入框事件
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  // 选择空间类型
  onSpaceTypeChange(e) {
    this.setData({
      spaceTypeIndex: e.detail.value
    });
  },

  // 选择封面图
  onChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          coverImage: res.tempFiles[0].tempFilePath
        });
      }
    });
  },

  // 添加项目图集图片
  onAddGalleryImages() {
    const currentCount = this.data.galleryImages.length;
    const maxCount = 9;
    
    if (currentCount >= maxCount) {
      wx.showToast({ title: '最多只能上传9张图片', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: maxCount - currentCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          galleryImages: [...this.data.galleryImages, ...newImages]
        });
      }
    });
  },

  // 删除图集中的图片
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const galleryImages = [...this.data.galleryImages];
    galleryImages.splice(index, 1);
    
    this.setData({
      galleryImages
    });
  },

  // 提交发布
  onSubmit() {
    const { coverImage, projectName, spaceTypeIndex, spaceTypes, description, galleryImages } = this.data;

    // 表单验证
    if (!coverImage) {
      wx.showToast({ title: '请上传封面图', icon: 'none' });
      return;
    }
    if (!projectName.trim()) {
      wx.showToast({ title: '请输入作品名称', icon: 'none' });
      return;
    }
    if (spaceTypeIndex === -1) {
      wx.showToast({ title: '请选择空间类型', icon: 'none' });
      return;
    }
    if (!description.trim()) {
      wx.showToast({ title: '请填写设计理念说明', icon: 'none' });
      return;
    }
    if (galleryImages.length === 0) {
      wx.showToast({ title: '请至少添加一张项目图集', icon: 'none' });
      return;
    }

    // 模拟上传和保存
    wx.showLoading({ title: '发布中...', mask: true });
    
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success',
        duration: 1500,
        success: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    }, 1000);
  }
});
