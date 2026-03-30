Page({
  data: {
    categories: ['全部', '住宅', '商铺', '办公室', '其他'],
    currentCategory: 0,
    demands: [] // 需求列表数据
  },

  onLoad(options) {
    this.loadDemands();
  },

  /**
   * 加载需求列表数据（与首页一致的 mock 数据）
   */
  loadDemands() {
    const mockDemands = [
      {
        _id: '1',
        space: '住宅',
        service: '整套灯光设计',
        budget: '¥19/m²',
        area: '150',
        stage: '未开始',
        priority: true,
        createdAt: new Date().toISOString()
      },
      {
        _id: '2',
        space: '商铺',
        service: '只深化灯光施工图',
        budget: '¥9/m²',
        area: '85',
        stage: '装修中',
        priority: false,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString() // 2天前
      },
      {
        _id: '3',
        space: '办公室',
        service: '选灯配灯服务',
        budget: '¥5/m²（只针对选灯配灯）',
        area: '450',
        stage: '正在设计',
        priority: false,
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString() // 10天前
      }
    ];

    const currentCategoryName = this.data.categories[this.data.currentCategory];

    // 处理标签并过滤分类
    let formattedDemands = mockDemands.map(item => {
      let tagType = '';
      let tagText = '';
      
      const isNew = (Date.now() - new Date(item.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
      
      if (item.priority) {
        tagType = 'purple';
        tagText = '加急';
      } else if (isNew) {
        tagType = 'blue';
        tagText = '新需求';
      }

      // 计算时间差
      const diffHours = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60));
      const timeText = diffHours < 24 ? `${diffHours}小时前发布` : `${Math.floor(diffHours/24)}天前发布`;

      return {
        ...item,
        title: `${item.space}灯光设计需求`,
        tagType,
        tagText,
        timeText
      };
    });

    if (currentCategoryName !== '全部') {
      formattedDemands = formattedDemands.filter(item => item.space === currentCategoryName);
    }

    this.setData({ demands: formattedDemands });
  },

  // 切换分类
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentCategory: index
    });
    this.loadDemands();
  },

  // 查看详情
  onViewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/designer-demand-detail/designer-demand-detail?id=${id}`
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({
      delta: 1
    });
  }
});
