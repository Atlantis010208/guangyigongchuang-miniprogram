Component({
  data: {
    show: true, // 控制 tabBar 显隐
    selected: 0,
    color: '#999999',
    selectedColor: '#007AFF',
    // 业主端 Tab 列表
    ownerList: [
      {
        pagePath: '/pages/products/products',
        text: '首页',
        iconPath: '/images/product.png',
        selectedIconPath: '/images/product-active.png'
      },
      {
        pagePath: '/pages/course/index/index',
        text: '课程',
        iconPath: '/images/24_课程(未选中).png',
        selectedIconPath: '/images/24_课程.png'
      },
      {
        pagePath: '/pages/toolbox/toolbox',
        text: '工具',
        iconPath: '/images/search.png',
        selectedIconPath: '/images/search-active.png'
      },
      {
        pagePath: '/pages/cart/cart',
        text: '订单管理',
        iconPath: '/images/cart.png',
        selectedIconPath: '/images/cart-active.png'
      }
    ],
    // 设计师端 Tab 列表
    designerList: [
      {
        pagePath: '/pages/designer-home/designer-home',
        text: '需求大厅',
        iconPath: '/images/explore.png',
        selectedIconPath: '/images/explore-active.png'
      },
      {
        pagePath: '/pages/designer-projects/designer-projects',
        text: '我的项目',
        iconPath: '/images/cart.png',
        selectedIconPath: '/images/cart-active.png'
      }
    ],
    // 当前显示的 Tab 列表
    list: [],
    role: 'owner' // 'owner' | 'designer'
  },

  lifetimes: {
    attached() {
      this._updateRole()
    }
  },

  methods: {
    // 根据全局角色信息更新 Tab 列表（公开方法，供页面 onShow 调用）
    updateRole() {
      this._updateRole()
    },

    // 根据全局角色信息更新 Tab 列表
    _updateRole() {
      const app = getApp()
      const userDoc = (app && app.globalData && app.globalData.userDoc) || wx.getStorageSync('userDoc')
      // 优先读取独立的 userRole 缓存（和 splash.js 判断逻辑一致）
      const userRole = wx.getStorageSync('userRole')
      const isDesigner = userRole === 'designer' || (userDoc && userDoc.roles === 2)
      const role = isDesigner ? 'designer' : 'owner'
      const list = isDesigner ? this.data.designerList : this.data.ownerList

      this.setData({ role, list })
    },

    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path

      wx.switchTab({ url })
    }
  }
})
