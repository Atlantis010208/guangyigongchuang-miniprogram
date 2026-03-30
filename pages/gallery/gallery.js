// pages/gallery/gallery.js

const categories = ["全部", "收藏", "住宅", "商业", "展厅", "办公"];

const initialImages = [
  { id: 1, title: "极简客厅", category: "住宅", seed: "livingroom", aspect: "aspect-square" },
  { id: 2, title: "暖光卧室", category: "住宅", seed: "bedroom", aspect: "aspect-3-4" },
  { id: 3, title: "艺术展厅", category: "展厅", seed: "gallery", aspect: "aspect-4-3" },
  { id: 4, title: "办公空间", category: "办公", seed: "office", aspect: "aspect-square" },
  { id: 5, title: "高端餐厅", category: "商业", seed: "restaurant", aspect: "aspect-3-4" },
  { id: 6, title: "走廊氛围", category: "商业", seed: "corridor", aspect: "aspect-square" },
  { id: 7, title: "现代厨房", category: "住宅", seed: "kitchen", aspect: "aspect-4-3" },
  { id: 8, title: "书房阅读", category: "住宅", seed: "study", aspect: "aspect-3-4" },
  { id: 9, title: "精品橱窗", category: "商业", seed: "boutique", aspect: "aspect-4-3" },
  { id: 10, title: "会议室", category: "办公", seed: "meeting", aspect: "aspect-square" },
];

Page({
  data: {
    categories: categories,
    activeCategory: "全部",
    searchQuery: "",
    images: initialImages,
    filteredImages: [],
    leftColImages: [],
    rightColImages: [],
    favorites: [],
    isFetching: false,
    isLoadingMore: false,
    showModal: false,
    currentSwiperIndex: 0,
    showControls: true,
    isDownloading: false,
    controlsTimeout: null
  },

  onLoad: function () {
    // 从本地存储加载收藏列表
    const savedFavorites = wx.getStorageSync('gallery_favorites');
    if (savedFavorites) {
      try {
        this.setData({ favorites: JSON.parse(savedFavorites) });
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }
    
    this.updateFilteredImages();
  },

  onShow: function() {
    // 隐藏原生 tabBar 避免在全屏时穿帮，但我们这是二级页面通常不需要
  },

  onCategorySelect: function(e) {
    const category = e.currentTarget.dataset.category;
    if (this.data.activeCategory === category) return;

    this.setData({ 
      activeCategory: category,
      isFetching: true 
    });

    // 模拟网络请求延迟
    setTimeout(() => {
      this.setData({ isFetching: false });
      this.updateFilteredImages();
    }, 600);
  },

  onSearchInput: function(e) {
    this.setData({ searchQuery: e.detail.value });
    this.updateFilteredImages();
  },

  updateFilteredImages: function() {
    const { images, activeCategory, searchQuery, favorites } = this.data;
    
    const filtered = images.filter((img) => {
      const matchesCategory = 
        activeCategory === "全部" ? true :
        activeCategory === "收藏" ? favorites.includes(img.id) :
        img.category === activeCategory;
      const matchesSearch = img.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    // 分割成两列以实现瀑布流
    const leftCol = [];
    const rightCol = [];
    
    filtered.forEach((img, index) => {
      if (index % 2 === 0) {
        leftCol.push(img);
      } else {
        rightCol.push(img);
      }
    });

    this.setData({ 
      filteredImages: filtered,
      leftColImages: leftCol,
      rightColImages: rightCol
    });
  },

  onToggleFavorite: function(e) {
    const id = e.currentTarget.dataset.id;
    this.toggleFavoriteLogic(id);
  },

  onToggleFavoriteCurrent: function() {
    const currentImg = this.data.filteredImages[this.data.currentSwiperIndex];
    if (currentImg) {
      this.toggleFavoriteLogic(currentImg.id);
      this.resetControlsTimeout();
    }
  },

  toggleFavoriteLogic: function(id) {
    let newFavorites = [...this.data.favorites];
    const index = newFavorites.indexOf(id);
    
    if (index > -1) {
      newFavorites.splice(index, 1);
    } else {
      newFavorites.push(id);
    }
    
    this.setData({ favorites: newFavorites });
    wx.setStorageSync('gallery_favorites', JSON.stringify(newFavorites));
    
    // 如果当前在收藏分类下取消收藏，需要刷新列表
    if (this.data.activeCategory === '收藏') {
      this.updateFilteredImages();
    }
  },

  onImageLoad: function(e) {
    const id = e.currentTarget.dataset.id;
    // 更新左列图片加载状态
    const leftIndex = this.data.leftColImages.findIndex(img => img.id === id);
    if (leftIndex > -1) {
      this.setData({ [`leftColImages[${leftIndex}].loaded`]: true });
      return;
    }
    // 更新右列图片加载状态
    const rightIndex = this.data.rightColImages.findIndex(img => img.id === id);
    if (rightIndex > -1) {
      this.setData({ [`rightColImages[${rightIndex}].loaded`]: true });
    }
  },

  onReachBottom: function() {
    this.loadMore();
  },

  loadMore: function() {
    if (this.data.activeCategory === "收藏" || this.data.isLoadingMore) return;
    
    this.setData({ isLoadingMore: true });
    
    setTimeout(() => {
      const prevImages = this.data.images;
      const newImages = Array.from({ length: 6 }).map((_, i) => {
        const id = prevImages.length + i + 1;
        const category = this.data.activeCategory === "全部" 
          ? categories[Math.floor(Math.random() * (categories.length - 2)) + 2] 
          : this.data.activeCategory;
        const aspects = ["aspect-square", "aspect-3-4", "aspect-4-3"];
        const aspect = aspects[Math.floor(Math.random() * aspects.length)];
        const seed = `generated-${id}-${Date.now()}`;
        
        return {
          id,
          title: `${category}灵感 ${id}`,
          category,
          seed,
          aspect,
          loaded: false
        };
      });
      
      this.setData({ 
        images: [...prevImages, ...newImages],
        isLoadingMore: false 
      });
      
      this.updateFilteredImages();
    }, 800);
  },

  // Modal Functions
  onImageSelect: function(e) {
    const id = e.currentTarget.dataset.id;
    const index = this.data.filteredImages.findIndex(img => img.id === id);
    
    if (index > -1) {
      this.setData({ 
        showModal: true,
        currentSwiperIndex: index,
        initialSwiperIndex: index // 记录打开时的初始索引
      });
      this.resetControlsTimeout();
    }
  },

  onCloseModal: function() {
    const { filteredImages, currentSwiperIndex, initialSwiperIndex } = this.data;
    const currentImg = filteredImages[currentSwiperIndex];
    
    this.setData({ showModal: false });
    this.clearControlsTimeout();

    // 只有当用户在大图中滑动切换了图片时，才需要重新定位
    if (currentImg && currentSwiperIndex !== initialSwiperIndex) {
      setTimeout(() => {
        wx.pageScrollTo({
          selector: `#img-${currentImg.id}`,
          duration: 300,
          offsetTop: -80 // 留出一点顶部安全距离
        });
      }, 50);
    }
  },

  onSwiperChange: function(e) {
    this.setData({ currentSwiperIndex: e.detail.current });
    this.resetControlsTimeout();
  },

  toggleModalControls: function(e) {
    if (!this.data.showControls) {
      this.resetControlsTimeout();
    } else {
      this.setData({ showControls: false });
      this.clearControlsTimeout();
    }
  },

  resetControlsTimeout: function() {
    this.setData({ showControls: true });
    this.clearControlsTimeout();
    
    const timeout = setTimeout(() => {
      this.setData({ showControls: false });
    }, 2500);
    
    this.setData({ controlsTimeout: timeout });
  },

  clearControlsTimeout: function() {
    if (this.data.controlsTimeout) {
      clearTimeout(this.data.controlsTimeout);
      this.setData({ controlsTimeout: null });
    }
  },

  onDownloadCurrent: function() {
    if (this.data.isDownloading) return;
    
    const currentImg = this.data.filteredImages[this.data.currentSwiperIndex];
    if (!currentImg) return;
    
    this.setData({ isDownloading: true });
    this.resetControlsTimeout();
    
    wx.showLoading({ title: '准备下载...' });
    
    wx.downloadFile({
      url: `https://picsum.photos/seed/${currentImg.seed}/1200/1600`,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({ title: '保存失败', icon: 'none' });
              console.error('Save image failed', err);
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
        console.error('Download failed', err);
      },
      complete: () => {
        this.setData({ isDownloading: false });
      }
    });
  }
});
