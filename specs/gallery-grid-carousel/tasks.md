# 工具箱"实景灯光图库"九宫格轮播 - 任务拆解

> 任务按"先样式骨架 → 后数据 → 再轮播"顺序排列，每步可独立编译验证，避免一次大改难以排错。
> 完成的任务用 `- [x]` 勾选；进行中保持 `- [ ]`。

---

## Implementation Plan

- [x] **1. WXSS 样式骨架（九宫格 + cross-fade + 底部加深）**
  - 新增 `.grid-bg`：`position: absolute; inset:0; display:grid; grid-template-columns: repeat(3,1fr); grid-template-rows: repeat(3,1fr); gap:0; z-index:1`
  - 新增 `.grid-cell`：`position: relative; width:100%; height:100%; overflow:hidden`
  - 新增 `.cell-img`：`position: absolute; inset:0; width:100%; height:100%; transition: opacity 600ms ease`
  - 新增 `.cell-img.fade-in { opacity:1 }` / `.cell-img.fade-out { opacity:0 }`
  - 新增 `.gallery-bottom-shade`：`position: absolute; left:0; right:0; bottom:0; height:200rpx; background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%); z-index:2; pointer-events:none`
  - _Requirement: R1-AC1, R1-AC4, R4-AC1, R4-AC3, R4-AC4_

- [x] **2. toolbox.js data 模型扩展**
  - 在 `data` 中新增 `imagePool: []`、`poolReady: false`、`gridImages: []`（9 个 `{a,b,showB}` 占位）
  - 在 `Page({...})` 实例新增 `this.timers = []`（不放进 data）
  - 顶部常量新增 `POOL_SIZE = 30`、`MIN_INTERVAL = 5000`、`MAX_INTERVAL = 8000`、`MAX_FIRST_DELAY = 3000`
  - _Requirement: R3-AC1_

- [x] **3. 数据加载方法 loadGalleryPool（含降级）**
  - 新增 `loadGalleryPool()` 方法：`wx.cloud.callFunction({name:'gallery_list', data:{action:'list', pageSize:30}})`
  - 成功路径：`result.data.images.length >= 9` → 调 `initGridImages(images)` → `setData({ imagePool, gridImages, poolReady:true })` → 调 `startCarousel()`
  - 失败路径（catch / `success===false` / images < 9）：`console.warn` + 不调用 `setData({poolReady:true})`，让 WXML 走单图兜底分支
  - 在 `onLoad` 中调用 `loadGalleryPool()`（保留 `loadGalleryCover()` 作为兜底单图来源）
  - _Requirement: R3-AC1, R3-AC4, R1-AC3_

- [x] **4. 池初始化 initGridImages（洗牌 + 取前 9）**
  - 新增辅助 `shuffle(arr)`：Fisher-Yates 算法，返回新数组
  - 新增 `initGridImages(pool)`：`shuffle(pool).slice(0,9)` 给每格的 `a` 字段赋值；`b=''`、`showB=false`
  - 返回 `{imagePool, gridImages}` 供 `loadGalleryPool` 使用
  - _Requirement: R1-AC1_

- [x] **5. WXML 改造（条件渲染 + 双层 buffer）**
  - 把原 `<image class="gallery-bg" wx:if="{{coverLoaded}}" .../>` 拆成两个分支：
    - `wx:if="{{poolReady}}"` 渲染 `.grid-bg` 内 9 个 `.grid-cell`，每 cell 含 A/B 两个 `<image class="cell-img">`，按 `cell.showB` 切换 `fade-in / fade-out`
    - `wx:else wx:if="{{coverLoaded}}"` 保留原单图 `<image class="gallery-bg" .../>`
  - 在 `.gallery-overlay` 后追加 `<view class="gallery-bottom-shade"></view>`
  - 保持外层 `bindtap="navigateToGallery"` 与 `hover-scale`、`gallery-content` 不动
  - _Requirement: R1-AC1, R1-AC2, R1-AC3, R1-AC4, R1-AC5, R4-AC1, R4-AC2_

- [x] **6. 不重复抽样 pickNext + 单格切换 swapCell**
  - 新增 `pickNext(idx)`：用 `gridImages[idx]` 的当前层（`showB ? b : a`）作为 `cur`；其他 8 格的当前层作为 `others`；先尝试 `pool.filter(s => s !== cur && !others.includes(s))`，空时回退到 `pool.filter(s => s !== cur)`
  - 新增 `swapCell(idx)`：调 `pickNext(idx)` 拿到 `next`；按 `cell.showB` 决定写入 `a` 还是 `b`，并翻转 `showB`，用 `setData({ ['gridImages['+idx+'].'+key]: next, ['gridImages['+idx+'].showB']: !showB })`
  - _Requirement: R2-AC3, R2-AC4, R2-AC5_

- [x] **7. 错峰调度 startCarousel / scheduleNext**
  - 新增 `scheduleNext(idx, delay)`：`this.timers[idx] = setTimeout(() => { this.swapCell(idx); this.scheduleNext(idx, MIN_INTERVAL + Math.random()*(MAX_INTERVAL-MIN_INTERVAL)) }, delay)`
  - 新增 `startCarousel()`：哨兵 `if (this.timers.length) return`；`for (i=0..8)` 调 `scheduleNext(i, Math.random()*MAX_FIRST_DELAY)`
  - _Requirement: R2-AC1, R2-AC2, R3-AC5_

- [x] **8. 销毁 stopCarousel + 生命周期接入**
  - 新增 `stopCarousel()`：`this.timers.forEach(clearTimeout); this.timers = []`
  - `onHide()` 调 `stopCarousel()`
  - `onUnload()` 调 `stopCarousel()`
  - `onShow()` 在原 tabBar 逻辑后追加：若 `data.poolReady && this.timers.length === 0` → `startCarousel()`
  - _Requirement: R3-AC2, R3-AC3, R3-AC5_

- [x] **9. 端到端联调 + 边界场景验证**
  - 真机/模拟器：进入工具箱见 9 张不同图，停留观察单格错峰切换、cross-fade 平滑无闪
  - 切到首页 tab，再切回，timer 不重复（控制台无 setData 节流警告）
  - 临时把 `pageSize` 设 0 mock 失败：验证降级到单图兜底
  - 视觉走查：底部"实景灯光图库"标题始终清晰可读；圆角裁切正常无溢出
  - _Requirement: R1-AC2, R1-AC3, R1-AC4, R3-AC2, R3-AC3, R3-AC4, R4-AC1_

---

## 任务依赖关系

```
1 (WXSS) ─┐
          ├─→ 5 (WXML) ─→ 9 (联调)
2 (data) ─┘
2 ─→ 3 (loadGalleryPool) ─→ 4 (initGridImages)
                          └─→ 7 (startCarousel) ─→ 6 (swapCell/pickNext)
                                                 └─→ 8 (stopCarousel + 生命周期)
```

> 实施顺序：1 → 2 → 5（看到九宫格骨架但还是空白）→ 3 → 4（看到首屏 9 张图）→ 6 → 7 → 8（看到错峰轮播）→ 9（验收）。
