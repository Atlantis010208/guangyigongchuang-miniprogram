Component({
  properties: {
    items: { type: Array, value: [] },
    value: { type: Array, value: [] },
  },

  data: {
    orderedItems: [],
    dragging: false,
    draggingId: '',
    dragOffset: 0,
  },

  observers: {
    'items, value': function syncItems(items, value) {
      if (this.data.dragging) return
      const ids = Array.isArray(value) && value.length
        ? value
        : (items || []).map((item) => item.id)
      const source = new Map((items || []).map((item) => [item.id, item]))
      const orderedItems = ids.filter((id) => source.has(id)).map((id) => source.get(id))
      ;(items || []).forEach((item) => {
        if (!ids.includes(item.id)) orderedItems.push(item)
      })
      this.setData({ orderedItems })
    },
  },

  lifetimes: {
    attached() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.rowStep = (info.windowWidth / 750) * 112
    },
  },

  methods: {
    onTouchStart(event) {
      const touch = event.touches[0]
      this.touchStartY = touch ? touch.clientY : 0
      const index = Number(event.currentTarget.dataset.index)
      const item = this.data.orderedItems[index]
      if (!item) return
      this.dragStartIndex = index
      this.lastTargetIndex = index
      this.setData({ dragging: true, draggingId: item.id, dragOffset: 0 })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
      this.triggerEvent('dragstate', { dragging: true })
    },

    onTouchMove(event) {
      if (!this.data.dragging) return
      const touch = event.touches[0]
      if (!touch) return
      const dragOffset = touch.clientY - this.touchStartY
      const maxIndex = this.data.orderedItems.length - 1
      const rawIndex = this.dragStartIndex + Math.round(dragOffset / this.rowStep)
      this.lastTargetIndex = Math.max(0, Math.min(maxIndex, rawIndex))
      this.setData({ dragOffset })
    },

    onTouchEnd() {
      if (!this.data.dragging) return
      const items = this.data.orderedItems.slice()
      const sourceIndex = this.dragStartIndex
      const targetIndex = this.lastTargetIndex
      const moved = items.splice(sourceIndex, 1)[0]
      items.splice(targetIndex, 0, moved)
      this.setData({
        orderedItems: items,
        dragging: false,
        draggingId: '',
        dragOffset: 0,
      })
      this.triggerEvent('dragstate', { dragging: false })
      if (targetIndex !== sourceIndex) {
        this.triggerEvent('change', { value: items.map((item) => item.id) })
      }
    },

    onTouchCancel() {
      if (!this.data.dragging) return
      this.setData({ dragging: false, draggingId: '', dragOffset: 0 })
      this.triggerEvent('dragstate', { dragging: false })
    },
  },
})
