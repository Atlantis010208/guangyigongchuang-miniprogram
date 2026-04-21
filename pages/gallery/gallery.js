// pages/gallery/gallery.js
// 灯光实景图库 - 接入云函数真实数据

const app = getApp()

Page({
  data: {
    // 标签相关
    categories: ['全部', '收藏'],
    categoryCloud: [],
    activeCategory: '全部',
    activeTag: '',
    searchQuery: '',

    // 图片列表
    filteredImages: [],
    leftColImages: [],
    rightColImages: [],

    // 收藏（imageId -> boolean 的映射存在 favoritesMap 中）
    favoritesMap: {},

    // 分页
    hasMore: true,

    // 状态
    isFetching: false,
    isLoadingMore: false,
    showModal: false,
    currentSwiperIndex: 0,
    showControls: true,
    isDownloading: false,
    controlsTimeout: null,

    // 搜索防抖
    _searchTimer: null
  },

  onLoad: function () {
    this.loadTags()
    this.loadImages()
  },

  onShow: function () {
    // 每次显示时静默刷新收藏状态（如果已有图片）
    if (this.data.filteredImages.length > 0) {
      this.batchCheckFavorites(this.data.filteredImages)
    }
  },

  onPullDownRefresh: function () {
    // 重置分页状态，重新加载
    this.setData({
      filteredImages: [],
      leftColImages: [],
      rightColImages: [],
      hasMore: true
    })

    // 重新加载标签（强制刷新，清除缓存版本号）
    wx.removeStorageSync('gallery_tagVersion')
    this.loadTags()

    // 重新加载图片
    if (this.data.activeCategory === '收藏') {
      this.loadFavoritesList()
    } else {
      this.loadImages()
    }

    // 轮询检查加载完成后停止下拉动画
    const timer = setInterval(() => {
      if (!this.data.isFetching && !this.data.isLoadingMore) {
        clearInterval(timer)
        wx.stopPullDownRefresh()
      }
    }, 200)
    // 兜底 3 秒后停止
    setTimeout(() => {
      clearInterval(timer)
      wx.stopPullDownRefresh()
    }, 3000)
  },

  // ==================== 标签 ====================

  _applyCategories: function (tags) {
    const categories = ['全部', '收藏', ...tags.map(t => t.name)]
    const cloudData = this.buildCloud(categories)
    this.setData({ 
      categories, 
      categoryCloud: cloudData.nodes,
      categoryCloudConfig: cloudData.config
    })
  },

  buildCloud: function (categories) {
    const anchorAll = { name: '全部' }
    const anchorFav = { name: '收藏' }
    
    // 过滤业务标签
    let businessTags = categories.filter(c => c !== '全部' && c !== '收藏')
    
    // 按照长度排序并交错，使得长短标签均匀分布在网格中
    businessTags.sort((a, b) => a.length - b.length)
    const interleavedTags = []
    while (businessTags.length > 0) {
      interleavedTags.push(businessTags.shift())
      if (businessTags.length > 0) interleavedTags.push(businessTags.pop())
    }

    const tagsToPlace = [anchorAll.name, anchorFav.name, ...interleavedTags]

    // 六边形螺旋网格生成器 (Hexagonal Spiral)
    // q, r 是轴向坐标，保证每个节点周围正好有 6 个邻居
    const hexSpiral = [ {q:0, r:0} ] // 中心点
    let radius = 1
    
    // 预生成足够多的网格坐标 (最多支持 200 个标签)
    while (hexSpiral.length < Math.max(50, tagsToPlace.length + 10)) {
      let q = radius
      let r = 0
      // 遍历 6 个方向的边
      const directions = [
        {dq: 0, dr: -1}, {dq: -1, dr: 0}, {dq: -1, dr: 1},
        {dq: 0, dr: 1}, {dq: 1, dr: 0}, {dq: 1, dr: -1}
      ]
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < radius; j++) {
          hexSpiral.push({ q, r })
          q += directions[i].dq
          r += directions[i].dr
        }
      }
      radius++
    }

    // 映射到物理像素 (长方形六边形网格)
    // 考虑到中文标签普遍较宽，dx 必须显著大于 dy
    // dx=200, dy=80 使得每个单元格最大容纳约 180rpx 宽度的标签
    const dx = 200 
    const dy = 80  

    const placedNodes = []
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

    tagsToPlace.forEach((tagName, index) => {
      if (index >= hexSpiral.length) return
      
      const { q, r } = hexSpiral[index]
      
      // 标准的六边形转笛卡尔坐标公式
      const bx = dx * (q + r / 2)
      const by = dy * r * Math.sqrt(3) / 2

      placedNodes.push({
        name: tagName,
        bx: bx,
        by: by
      })

      minX = Math.min(minX, bx)
      maxX = Math.max(maxX, bx)
      minY = Math.min(minY, by)
      maxY = Math.max(maxY, by)
    })

    // Torus 边界优化：使用规整的跨度加上一个单元格的冗余
    const torusWidth = (maxX - minX) + dx * 1.5
    const torusHeight = (maxY - minY) + dy * 2.5

    return {
      nodes: placedNodes,
      config: {
        torusWidth: Math.max(600, torusWidth),
        torusHeight: Math.max(600, torusHeight)
      }
    }
  },

  loadTags: function () {
    const cachedVersion = wx.getStorageSync('gallery_tagVersion') || 0
    wx.cloud.callFunction({
      name: 'gallery_list',
      data: { action: 'tags', tagVersion: cachedVersion }
    }).then(res => {
      const result = res.result
      if (!result || !result.success) return

      if (result.data.notModified) {
        // 使用本地缓存的标签
        const cachedTags = wx.getStorageSync('gallery_tags') || []
        if (cachedTags.length > 0) {
          this._applyCategories(cachedTags)
        }
        return
      }

      const tags = result.data.tags || []
      wx.setStorageSync('gallery_tags', tags)
      wx.setStorageSync('gallery_tagVersion', result.data.tagVersion)
      this._applyCategories(tags)
    }).catch(err => {
      console.error('[gallery] 加载标签失败:', err)
      // 降级：使用本地缓存
      const cachedTags = wx.getStorageSync('gallery_tags') || []
      if (cachedTags.length > 0) {
        this._applyCategories(cachedTags)
      }
    })
  },

  onCategorySelect: function (e) {
    const category = e.currentTarget.dataset.category
    if (this.data.activeCategory === category) return

    this.setData({
      activeCategory: category,
      activeTag: (category !== '全部' && category !== '收藏') ? category : '',
      filteredImages: [],
      leftColImages: [],
      rightColImages: [],
      hasMore: true,
      isFetching: true
    })

    if (category === '收藏') {
      this.loadFavoritesList()
    } else {
      this.loadImages()
    }
  },

  // ==================== 搜索 ====================

  onSearchInput: function (e) {
    const value = e.detail.value
    this.setData({ searchQuery: value })

    // 防抖 500ms
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this.setData({
        filteredImages: [],
        leftColImages: [],
        rightColImages: [],
        hasMore: true
      })

      if (this.data.activeCategory === '收藏') {
        this.loadFavoritesList()
      } else {
        this.loadImages()
      }
    }, 500)
  },

  // ==================== 图片列表 ====================

  loadImages: function () {
    const { activeTag, searchQuery, filteredImages } = this.data
    const offset = filteredImages.length

    this.setData({ isFetching: offset === 0, isLoadingMore: offset > 0 })

    const params = {
      action: searchQuery ? 'search' : 'list',
      pageSize: 20,
      offset: offset
    }

    if (activeTag) params.tag = activeTag
    if (searchQuery) params.keyword = searchQuery

    wx.cloud.callFunction({
      name: 'gallery_list',
      data: params
    }).then(res => {
      const result = res.result
      if (!result || !result.success) {
        this.setData({ isFetching: false, isLoadingMore: false })
        return
      }

      const newImages = (result.data.images || []).map(img => ({
        ...img,
        id: img._id,
        loaded: false
      }))

      const prevImages = offset > 0 ? this.data.filteredImages : []
      const allImages = [...prevImages, ...newImages]

      this.splitColumns(allImages, offset > 0, prevImages.length)
      this.setData({
        filteredImages: allImages,
        hasMore: result.data.hasMore,
        isFetching: false,
        isLoadingMore: false
      })

      // 批量检查收藏状态
      if (newImages.length > 0) {
        this.batchCheckFavorites(newImages)
      }
    }).catch(err => {
      console.error('[gallery] 加载图片失败:', err)
      this.setData({ isFetching: false, isLoadingMore: false })
    })
  },

  // ==================== 收藏列表 ====================

  loadFavoritesList: function () {
    const isLoggedIn = app.isLoggedIn && app.isLoggedIn()
    if (!isLoggedIn) {
      // 未登录：使用本地收藏
      this.setData({ isFetching: false, filteredImages: [], leftColImages: [], rightColImages: [] })
      return
    }

    const offset = this.data.filteredImages.length
    this.setData({ isFetching: offset === 0, isLoadingMore: offset > 0 })

    const params = { action: 'list', pageSize: 20, offset: offset }

    wx.cloud.callFunction({
      name: 'gallery_favorites',
      data: params
    }).then(res => {
      const result = res.result
      if (!result || !result.success) {
        this.setData({ isFetching: false, isLoadingMore: false })
        return
      }

      const newImages = (result.data.images || []).map(img => ({
        ...img,
        id: img._id,
        loaded: false
      }))

      const prevImages = offset > 0 ? this.data.filteredImages : []
      const allImages = [...prevImages, ...newImages]

      // 收藏列表中的图片全部标记为已收藏
      const newMap = { ...this.data.favoritesMap }
      newImages.forEach(img => { newMap[img.id] = true })

      this.splitColumns(allImages, offset > 0, prevImages.length)
      this.setData({
        filteredImages: allImages,
        favoritesMap: newMap,
        hasMore: result.data.hasMore,
        isFetching: false,
        isLoadingMore: false
      })
    }).catch(err => {
      console.error('[gallery] 加载收藏列表失败:', err)
      this.setData({ isFetching: false, isLoadingMore: false })
    })
  },

  // ==================== 收藏操作 ====================

  batchCheckFavorites: function (images) {
    const isLoggedIn = app.isLoggedIn && app.isLoggedIn()
    if (!isLoggedIn || !images || images.length === 0) return

    const imageIds = images.map(img => img.id || img._id).filter(Boolean)
    if (imageIds.length === 0) return

    wx.cloud.callFunction({
      name: 'gallery_favorites',
      data: { action: 'batchCheck', imageIds }
    }).then(res => {
      const result = res.result
      if (!result || !result.success) return

      const serverMap = result.data.favorites || {}
      const newMap = { ...this.data.favoritesMap, ...serverMap }
      this.setData({ favoritesMap: newMap })
    }).catch(err => {
      console.warn('[gallery] 批量检查收藏失败:', err)
    })
  },

  onToggleFavorite: function (e) {
    const id = e.currentTarget.dataset.id
    this.toggleFavoriteLogic(id)
  },

  onToggleFavoriteCurrent: function () {
    const currentImg = this.data.filteredImages[this.data.currentSwiperIndex]
    if (currentImg) {
      this.toggleFavoriteLogic(currentImg.id)
      this.resetControlsTimeout()
    }
  },

  toggleFavoriteLogic: function (id) {
    const isLoggedIn = app.isLoggedIn && app.isLoggedIn()
    if (!isLoggedIn) {
      // 未登录，提示登录
      app.requireLogin && app.requireLogin({ showModal: true })
      return
    }

    const isFavorited = this.data.favoritesMap[id]
    const action = isFavorited ? 'remove' : 'add'

    // 乐观更新 UI
    const newMap = { ...this.data.favoritesMap }
    newMap[id] = !isFavorited
    this.setData({ favoritesMap: newMap })

    wx.cloud.callFunction({
      name: 'gallery_favorites',
      data: { action, imageId: id }
    }).then(res => {
      const result = res.result
      if (!result || !result.success) {
        // 回滚
        const rollbackMap = { ...this.data.favoritesMap }
        rollbackMap[id] = isFavorited
        this.setData({ favoritesMap: rollbackMap })
        return
      }

      // 如果在收藏列表中取消了收藏，从列表移除
      if (this.data.activeCategory === '收藏' && action === 'remove') {
        const filtered = this.data.filteredImages.filter(img => img.id !== id)
        this.splitColumns(filtered)
        this.setData({ filteredImages: filtered })
      }
    }).catch(err => {
      console.error('[gallery] 收藏操作失败:', err)
      // 回滚
      const rollbackMap = { ...this.data.favoritesMap }
      rollbackMap[id] = isFavorited
      this.setData({ favoritesMap: rollbackMap })
    })
  },

  // ==================== 瀑布流分列 ====================

  /**
   * 瀑布流分列
   * @param {Array} images - 全量图片数组
   * @param {boolean} append - true=增量追加（加载更多），false=全量重建（首次/切换分类）
   * @param {number} appendFrom - 增量追加时从 images 的哪个索引开始
   */
  splitColumns: function (images, append, appendFrom) {
    if (append && appendFrom > 0) {
      // 增量模式：只追加新图片到列末尾，不触碰已有图片
      const newImages = images.slice(appendFrom)
      const updates = {}
      const leftLen = this.data.leftColImages.length
      const rightLen = this.data.rightColImages.length
      let leftAdd = 0
      let rightAdd = 0

      newImages.forEach((img, i) => {
        const globalIndex = appendFrom + i
        if (globalIndex % 2 === 0) {
          updates[`leftColImages[${leftLen + leftAdd}]`] = img
          leftAdd++
        } else {
          updates[`rightColImages[${rightLen + rightAdd}]`] = img
          rightAdd++
        }
      })
      this.setData(updates)
    } else {
      // 全量模式：首次加载或切换分类
      const leftCol = []
      const rightCol = []
      images.forEach((img, index) => {
        if (index % 2 === 0) {
          leftCol.push(img)
        } else {
          rightCol.push(img)
        }
      })
      this.setData({ leftColImages: leftCol, rightColImages: rightCol })
    }
  },

  // ==================== 图片加载状态 ====================

  onImageLoad: function (e) {
    const id = e.currentTarget.dataset.id
    const leftIndex = this.data.leftColImages.findIndex(img => img.id === id)
    if (leftIndex > -1) {
      this.setData({ [`leftColImages[${leftIndex}].loaded`]: true })
      return
    }
    const rightIndex = this.data.rightColImages.findIndex(img => img.id === id)
    if (rightIndex > -1) {
      this.setData({ [`rightColImages[${rightIndex}].loaded`]: true })
    }
  },

  // ==================== 分页加载 ====================

  onReachBottom: function () {
    this.loadMore()
  },

  loadMore: function () {
    if (!this.data.hasMore || this.data.isLoadingMore || this.data.isFetching) return

    if (this.data.activeCategory === '收藏') {
      this.loadFavoritesList()
    } else {
      this.loadImages()
    }
  },

  // ==================== 全屏预览 Modal ====================

  onImageSelect: function (e) {
    const id = e.currentTarget.dataset.id
    const index = this.data.filteredImages.findIndex(img => img.id === id)

    if (index > -1) {
      this.setData({
        showModal: true,
        currentSwiperIndex: index,
        initialSwiperIndex: index
      })
      this.resetControlsTimeout()
    }
  },

  onCloseModal: function () {
    const { filteredImages, currentSwiperIndex, initialSwiperIndex } = this.data
    const currentImg = filteredImages[currentSwiperIndex]

    this.setData({ showModal: false })
    this.clearControlsTimeout()

    if (currentImg && currentSwiperIndex !== initialSwiperIndex) {
      setTimeout(() => {
        wx.pageScrollTo({
          selector: `#img-${currentImg.id}`,
          duration: 300,
          offsetTop: -80
        })
      }, 50)
    }
  },

  onSwiperChange: function (e) {
    this.setData({ currentSwiperIndex: e.detail.current })
    this.resetControlsTimeout()
  },

  toggleModalControls: function (e) {
    if (!this.data.showControls) {
      this.resetControlsTimeout()
    } else {
      this.setData({ showControls: false })
      this.clearControlsTimeout()
    }
  },

  resetControlsTimeout: function () {
    this.setData({ showControls: true })
    this.clearControlsTimeout()

    const timeout = setTimeout(() => {
      this.setData({ showControls: false })
    }, 2500)

    this.setData({ controlsTimeout: timeout })
  },

  clearControlsTimeout: function () {
    if (this.data.controlsTimeout) {
      clearTimeout(this.data.controlsTimeout)
      this.setData({ controlsTimeout: null })
    }
  },

  // ==================== 下载原图 ====================

  onDownloadCurrent: function () {
    if (this.data.isDownloading) return

    const currentImg = this.data.filteredImages[this.data.currentSwiperIndex]
    if (!currentImg) return

    this.setData({ isDownloading: true })
    this.resetControlsTimeout()

    wx.showLoading({ title: '准备下载...' })

    // 先获取高清原图 URL
    wx.cloud.callFunction({
      name: 'gallery_list',
      data: { action: 'detail', imageId: currentImg.id }
    }).then(res => {
      const result = res.result
      if (!result || !result.success || !result.data.fileUrl) {
        wx.hideLoading()
        wx.showToast({ title: '获取原图失败', icon: 'none' })
        this.setData({ isDownloading: false })
        return
      }

      const fileUrl = result.data.fileUrl
      wx.downloadFile({
        url: fileUrl,
        success: (dlRes) => {
          if (dlRes.statusCode === 200) {
            wx.saveImageToPhotosAlbum({
              filePath: dlRes.tempFilePath,
              success: () => {
                wx.hideLoading()
                wx.showToast({ title: '已保存到相册', icon: 'success' })
              },
              fail: (err) => {
                wx.hideLoading()
                wx.showToast({ title: '保存失败', icon: 'none' })
                console.error('Save image failed', err)
              }
            })
          } else {
            wx.hideLoading()
            wx.showToast({ title: '下载失败', icon: 'none' })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
          console.error('Download failed', err)
        },
        complete: () => {
          this.setData({ isDownloading: false })
        }
      })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '下载失败', icon: 'none' })
      console.error('Get detail failed', err)
      this.setData({ isDownloading: false })
    })
  }
})
