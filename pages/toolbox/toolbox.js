// pages/toolbox/toolbox.js
const DEFAULT_GALLERY_COVER = 'https://picsum.photos/seed/luxuryinterior/800/800'
const DEFAULT_CT_BG = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/toolbox/color-temp-bg.png'
const DEFAULT_CALC_BG = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/toolbox/calculator-bg.jpeg'

// 九宫格背景轮播参数
const INITIAL_BATCH = 40       // 首批拉取数量（gallery_list 云函数单次上限为 40）
const PAGE_SIZE = 40           // 后续分页拉取，每页 40
const MAX_POOL_SIZE = 1000     // 池上限（防御）：极端场景下不超过 1000 张避免内存占用过高
const FETCH_GAP = 600          // 后续分页之间的间隔（ms），避免连续冲击云函数
const GRID_COUNT = 9           // 3x3 = 9 个格子
const MIN_INTERVAL = 5000      // 单格切换间隔下限 5s
const MAX_INTERVAL = 8000      // 单格切换间隔上限 8s
const MAX_FIRST_DELAY = 3000   // 启动时随机首次延迟上限 3s（错峰）

Page({
  data: {
    galleryCover: '',
    coverLoaded: false,
    ctBgImage: DEFAULT_CT_BG,
    calcBgImage: DEFAULT_CALC_BG,

    // 九宫格轮播
    imagePool: [],   // 动态扩张的缩略图 URL 池（首批 40，后续背景拉取逐步追加直至全量）
    poolReady: false, // 池是否就绪（首批成功且 length>=9）
    gridImages: []   // 9 个格子的状态：[{base, swap, swapVisible, noTransition, pending, pendingHandover}]
  },

  onLoad: function (options) {
    // 实例属性（非 data）：
    //   timers           轮播定时器句柄数组（避免每次 setTimeout 触发不必要的 render）
    //   poolFetching     当前是否有进行中的拉取请求，避免重入
    //   poolHasMore      服务器侧是否还有下一页
    //   poolOffset       下次拉取的 skip 偏移量
    //   poolUrlSet       全局 URL 去重集（跨分页去重）
    //   poolFetchEnabled 后续拉取开关（onUnload 会置 false 中止递归）
    this.timers = []
    this.handoverTimers = []   // 每格 swap 交接兑底 timer（防真机 transitionend 不触发死锁）
    this.poolFetching = false
    this.poolHasMore = true
    this.poolOffset = 0
    this.poolUrlSet = {}
    this.poolFetchEnabled = true

    this.loadGalleryCover()    // 单图兜底：先加载，万一池失败可降级
    this.loadGalleryPool()     // 九宫格主路径：首批 + 背景全量拉取
    this.loadCtBgImage()
  },

  onPullDownRefresh: function () {
    this.loadGalleryCover()
    this.loadCtBgImage()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 800)
  },

  onShow: function () {
    // 切换自定义 tabBar 的激活状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3 // 0:首页 1:商城 2:课程 3:工具 4:订单
      })
    }

    // 池已就绪且 timer 未启动时恢复轮播（用户从其他 tab 回来等场景）
    if (this.data.poolReady && (!this.timers || this.timers.length === 0)) {
      this.startCarousel()
    }
  },

  onHide: function () {
    // 切走时立刻清空所有 timer，避免后台烧流量与性能
    this.stopCarousel()
  },

  onUnload: function () {
    this.stopCarousel()
    // 中止后续分页拉取，避免页面卸载后仍有请求回调中的 setData 报错
    this.poolFetchEnabled = false
  },

  navigateToSearch: function() {
    wx.navigateTo({
      url: '/pages/search/search'
    })
  },

  navigateToGallery: function() {
    wx.navigateTo({
      url: '/pages/gallery/gallery'
    })
  },

  navigateToComingSoon: function() {
    wx.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none',
      duration: 2000
    })
  },

  navigateToColorTemp: function () {
    wx.navigateTo({
      url: '/pages/color-temp/color-temp'
    })
  },

  loadCtBgImage: function () {
    const db = wx.cloud.database()
    db.collection('color_temp_config').doc('global_config').get().then(res => {
      const data = res.data
      if (data && data.pageConfig) {
        const img = data.pageConfig.cardBgImage || data.pageConfig.bgImage
        if (img) {
          this.setData({ ctBgImage: img })
        }
      }
    }).catch(err => {
      console.warn('[toolbox] 加载色温背景图配置失败，使用默认图:', err)
    })
  },

  loadGalleryCover: function () {
    wx.cloud.callFunction({
      name: 'gallery_list',
      data: { action: 'getCover' }
    }).then(res => {
      const result = res.result
      if (result && result.success && result.data && result.data.coverUrl) {
        this.setData({ galleryCover: result.data.coverUrl, coverLoaded: true })
      } else {
        this.setData({ galleryCover: DEFAULT_GALLERY_COVER, coverLoaded: true })
      }
    }).catch(err => {
      console.warn('[toolbox] 加载图库封面图失败:', err)
      this.setData({ galleryCover: DEFAULT_GALLERY_COVER, coverLoaded: true })
    })
  },

  // ==================== 九宫格背景轮播 ====================

  /**
   * 启动图片池加载：先拉首批，够 9 张就启轮播；随后背景递归拉后续页动态扩张池。
   * 优势：用户不需要等全部拉完就能看到轮播；背景拉取中池不断变大，越看越新鲜。
   * 失败或首批不足 9 张则保持 poolReady=false，WXML 自动降级为单图兑底。
   */
  loadGalleryPool: function () {
    this.poolUrlSet = {}
    this.poolOffset = 0
    this.poolHasMore = true
    this.poolFetchEnabled = true
    this.fetchNextPage(true)
  },

  /**
   * 拉取下一页图片池。
   *   - isFirst=true 首批：足 9 张即初始化 9 格 + 启轮播，不足则降级
   *   - isFirst=false 后续批：去重后追加到 imagePool，轮播在运行中自然使用
   * 递归中止条件：!hasMore / 达到 MAX_POOL_SIZE / poolFetchEnabled=false
   */
  fetchNextPage: function (isFirst) {
    if (this.poolFetching) return
    if (!this.poolHasMore) return
    if (!this.poolFetchEnabled) return
    if ((this.data.imagePool || []).length >= MAX_POOL_SIZE) {
      this.poolHasMore = false
      return
    }

    this.poolFetching = true
    wx.cloud.callFunction({
      name: 'gallery_list',
      data: { action: 'list', pageSize: PAGE_SIZE, offset: this.poolOffset }
    }).then(res => {
      this.poolFetching = false
      const result = res.result
      if (!result || !result.success || !result.data || !Array.isArray(result.data.images)) {
        console.warn('[toolbox] 图片池接口返回异常' + (isFirst ? '，降级为单图模式' : ''))
        this.poolHasMore = false
        return
      }

      // 本页去重（跨页 + 同页）
      const newOnes = []
      const raw = result.data.images
      for (let i = 0; i < raw.length; i++) {
        const url = raw[i] && raw[i].thumbUrl
        if (!url || this.poolUrlSet[url]) continue
        this.poolUrlSet[url] = true
        newOnes.push(url)
      }

      this.poolOffset += raw.length
      this.poolHasMore = !!result.data.hasMore

      if (isFirst) {
        // 首批：够 GRID_COUNT 才能启轮播
        if (newOnes.length < GRID_COUNT) {
          console.warn('[toolbox] 首批图片去重后不足 9 张，降级为单图模式 (got=' + newOnes.length + ')')
          return
        }
        const gridImages = this.initGridImages(newOnes)
        this.setData({
          imagePool: newOnes,
          gridImages: gridImages,
          poolReady: true
        }, () => {
          // 首批 setData 完成后再启动 carousel，保证 9 张图先呈现再 fade
          this.startCarousel()
          // 同时启动背景拉取剩余页
          this._scheduleNextFetch()
        })
      } else {
        // 后续批：追加到现有池
        if (newOnes.length > 0) {
          this.setData({
            imagePool: this.data.imagePool.concat(newOnes)
          })
        }
        this._scheduleNextFetch()
      }
    }).catch(err => {
      this.poolFetching = false
      console.warn('[toolbox] 加载图片池失败' + (isFirst ? '，降级为单图模式' : '（背景页）') + ':', err)
      // 后续页失败不加中止池，仅停止本轮拉取；下次生命周期重试
      this.poolHasMore = false
    })
  },

  /**
   * 错峰排下一页拉取，避免连续冲击云函数
   */
  _scheduleNextFetch: function () {
    if (!this.poolHasMore) return
    if (!this.poolFetchEnabled) return
    setTimeout(() => {
      if (!this.poolFetchEnabled) return
      this.fetchNextPage(false)
    }, FETCH_GAP)
  },

  /**
   * Fisher-Yates 洗牌，返回新数组（不修改入参）
   */
  shuffle: function (arr) {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = a[i]
      a[i] = a[j]
      a[j] = tmp
    }
    return a
  },

  /**
   * 从池中洗牌取前 9 张作为 9 格的初始 base 图。
   * 返回 [{base, swap, swapVisible, noTransition, pending}] 结构。
   *   base         当前稳定显示的图，opacity:1 永不变
   *   swap         切换时加载的新图，默认 ''
   *   swapVisible  swap 是否激活（0→1 淡入）
   *   noTransition 交接瞬间暂闭 transition，让 swap 从 1 瞬时归 0
   *   pending      是否有进行中的切换（swapCell 锁、doSwapHandover 解锁）
   */
  initGridImages: function (pool) {
    const picks = this.shuffle(pool).slice(0, GRID_COUNT)
    const grid = []
    for (let i = 0; i < GRID_COUNT; i++) {
      grid.push({
        base: picks[i] || pool[0] || '',
        swap: '',
        swapVisible: false,
        noTransition: false,
        pending: false,
        pendingHandover: false  // base.src 已换，等 onBaseLoaded 确认 native 绘制完成后才消失 swap
      })
    }
    return grid
  },

  /**
   * 取格子 idx 当前稳定显示的图（即 base 层）
   */
  activeSrcOf: function (idx) {
    const cell = this.data.gridImages[idx]
    if (!cell) return ''
    return cell.base
  },

  /**
   * 取除 idx 外其他 8 格当前占用的图，用于"同时刻不重复"过滤。
   * 除了各格的 base，还需加入正在切换中的 swap 图——
   * 否则两格并发 swap 可能选中同一张，完成后同时出现重复图。
   */
  allActiveSrcsExcept: function (idx) {
    const arr = []
    const grid = this.data.gridImages
    for (let i = 0; i < grid.length; i++) {
      if (i === idx) continue
      const c = grid[i]
      arr.push(c.base)
      if (c.pending && c.swap) arr.push(c.swap)
    }
    return arr
  },

  /**
   * 从图片池中为格子 idx 挑下一张图：
   *   - 优先排除该格当前图 + 其余 8 格当前图
   *   - 若候选为空（池子小于 9 等极端场景），仅排除该格当前图（保证 R2-AC5）
   */
  pickNext: function (idx) {
    const cur = this.activeSrcOf(idx)
    const others = this.allActiveSrcsExcept(idx)
    const pool = this.data.imagePool

    let candidates = pool.filter(s => s !== cur && others.indexOf(s) === -1)
    if (candidates.length === 0) {
      candidates = pool.filter(s => s !== cur)
    }
    if (candidates.length === 0) return cur // 极端兜底
    return candidates[Math.floor(Math.random() * candidates.length)]
  },

  /**
   * 单格切换：将新图写入 swap 层并锁定 pending。
   * swap 层 src 变化会触发 native 加载→ bindload → onSwapLoaded 启动淡入。
   * base 层 opacity:1 永不动，全程顶住画面，真机上永不会出现"画面空"闪光。
   */
  swapCell: function (idx) {
    const cell = this.data.gridImages[idx]
    if (!cell) return
    if (cell.pending) return  // 上一轮切换还未完成，跳过本轮（下次 scheduleNext 会重调）

    const next = this.pickNext(idx)
    if (!next || next === cell.base) return

    this.setData({
      ['gridImages[' + idx + '].swap']: next,
      ['gridImages[' + idx + '].pending']: true,
      ['gridImages[' + idx + '].noTransition']: false  // 确保 transition 启用
    })
  },

  /**
   * swap 层图片加载完成回调：给 native 一点缓冲后启动 0→1 淡入。
   * base 层始终 opacity:1 永驻，所以即使 swap 本帧未绘制完成，用户看到的是 base，不会闪。
   */
  onSwapLoaded: function (e) {
    const ds = e.currentTarget.dataset
    const idx = parseInt(ds.idx, 10)
    if (!this.data.gridImages[idx]) return

    const cell = this.data.gridImages[idx]
    if (!cell.pending) return     // 没有进行中的切换（首载不触发，因 swap 初始为 ''）
    if (cell.swapVisible) return  // 已在淡入中，重复 bindload 忽略

    setTimeout(() => {
      const latest = this.data.gridImages[idx]
      if (!latest || !latest.pending || latest.swapVisible) return
      this.setData({
        ['gridImages[' + idx + '].swapVisible']: true
      })
      // 兑底 timer：防真机 transitionend 偏微不触发导致 pending 永远锁住。
      // 1100ms = 600ms transition + 500ms 宽量，足够覆盖所有正常场景。
      if (this.handoverTimers[idx]) clearTimeout(this.handoverTimers[idx])
      this.handoverTimers[idx] = setTimeout(() => {
        this.doSwapHandover(idx)
      }, 1100)
    }, 16)
  },

  /**
   * swap 层 opacity transition 结束回调：进入交接阶段。
   * 仅处理 opacity 结束，其他 transition 属性忽略。
   */
  onSwapTransitionEnd: function (e) {
    if (e && e.detail && e.detail.propertyName && e.detail.propertyName !== 'opacity') return
    const ds = e.currentTarget.dataset
    const idx = parseInt(ds.idx, 10)
    this.doSwapHandover(idx)
  },

  /**
   * swap 交接到 base —— 两阶段处理，防止 iOS native 重新 decode base.src 期间的拖影：
   *
   * 阶段一 (doSwapHandover)：先换 base.src + 锁 noTransition + 锁 pendingHandover
   *   → base 层 native 重新加载并 decode 新图，期间 swap 层 opacity:1 仍完全覆盖 base
   *   → 用户看到的是 swap 完整画面，base 层重绘过程完全被遮蔽
   *
   * 阶段二 (continueHandover)：由 onBaseLoaded 或 200ms 兑底触发
   *   → 此时确认 base 层 native 已绘制好新图
   *   → 才让 swap 瞬时归零（no-trans），用户看到的是 base 的新图 → 无拖影/拖动
   *
   * onSwapTransitionEnd 与 轮播兑底 timer 都会调本方法，内部锁防重复执行。
   */
  doSwapHandover: function (idx) {
    const cell = this.data.gridImages[idx]
    if (!cell) return
    if (!cell.pending) return         // 已交接过（onSwapTransitionEnd 和兑底 timer 二选一）
    if (!cell.swapVisible) return     // 未淡入完成，不该交接
    if (!cell.swap) return
    if (cell.pendingHandover) return  // 阶段二进行中，忽略重入

    if (this.handoverTimers[idx]) {
      clearTimeout(this.handoverTimers[idx])
      this.handoverTimers[idx] = null
    }

    const newBase = cell.swap

    // 阶段一：换 base.src + 锁 transition + 锁 pendingHandover。swap 仍覆盖中，用户不会看到 base 重绘。
    this.setData({
      ['gridImages[' + idx + '].base']: newBase,
      ['gridImages[' + idx + '].noTransition']: true,
      ['gridImages[' + idx + '].pendingHandover']: true
    })

    // 兑底 timer：万一 onBaseLoaded 不触发（如 native 内部优化跳过事件），200ms 后强制进阶段二
    this.handoverTimers[idx] = setTimeout(() => {
      this.continueHandover(idx)
    }, 200)
  },

  /**
   * base 层 bindload 回调：
   *   - 首载时亦会触发（cell.pendingHandover=false），直接忽略
   *   - 交接阶段一后 base.src 变更触发（pendingHandover=true），代表 native 已绘制好新图
   *     该场景下进阶段二：让 swap 消失
   */
  onBaseLoaded: function (e) {
    const ds = e.currentTarget.dataset
    const idx = parseInt(ds.idx, 10)
    if (!this.data.gridImages[idx]) return

    const cell = this.data.gridImages[idx]
    if (!cell.pendingHandover) return  // 首载或未进入交接阶段一

    // 再等 1 帧以确保 native CALayer 的新帧已提交到合成线程
    setTimeout(() => {
      this.continueHandover(idx)
    }, 16)
  },

  /**
   * 交接阶段二：base 已绘好新图，现在安全消失 swap。
   * onBaseLoaded 与 200ms 兑底 timer 都会调，内部锁防重复。
   */
  continueHandover: function (idx) {
    const cell = this.data.gridImages[idx]
    if (!cell) return
    if (!cell.pendingHandover) return  // 已进过阶段二或从未进入

    if (this.handoverTimers[idx]) {
      clearTimeout(this.handoverTimers[idx])
      this.handoverTimers[idx] = null
    }

    // Step A: swapVisible=false【瞬时】归零（no-trans 不会淡出），同时释放 pendingHandover
    this.setData({
      ['gridImages[' + idx + '].swapVisible']: false,
      ['gridImages[' + idx + '].pendingHandover']: false
    }, () => {
      // Step B: 下一帧恢复 transition + 解锁 pending。swap 字段保留，下次会被覆盖
      setTimeout(() => {
        this.setData({
          ['gridImages[' + idx + '].noTransition']: false,
          ['gridImages[' + idx + '].pending']: false
        })
      }, 50)
    })
  },

  /**
   * 链式 setTimeout：每次切换完成后再排下一次，间隔 5–8s 随机抖动
   * 用 setTimeout 而非 setInterval，是为了让每次间隔都重新随机
   */
  scheduleNext: function (idx, delay) {
    this.timers[idx] = setTimeout(() => {
      this.swapCell(idx)
      const next = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
      this.scheduleNext(idx, next)
    }, delay)
  },

  /**
   * 启动 9 格错峰轮播：每格首次延迟 0–3s 随机，后续 5–8s 随机
   * 通过 timers.length 哨兵防止 onShow 等场景重复启动（R3-AC5）
   */
  startCarousel: function () {
    if (!this.timers) this.timers = []
    if (this.timers.length > 0) return
    for (let i = 0; i < GRID_COUNT; i++) {
      const firstDelay = Math.random() * MAX_FIRST_DELAY
      this.scheduleNext(i, firstDelay)
    }
  },

  /**
   * 停止轮播并清空所有 timer（轮播主 timer + swap 交接兑底 timer）
   */
  stopCarousel: function () {
    if (this.timers && this.timers.length > 0) {
      this.timers.forEach(id => { if (id) clearTimeout(id) })
      this.timers = []
    }
    if (this.handoverTimers && this.handoverTimers.length > 0) {
      this.handoverTimers.forEach(id => { if (id) clearTimeout(id) })
      this.handoverTimers = []
    }
  }
})
