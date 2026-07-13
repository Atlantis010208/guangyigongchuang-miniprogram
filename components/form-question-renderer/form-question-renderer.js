Component({
  properties: {
    question: { type: Object, value: {} },
    answer: { type: null, value: null },
  },

  data: {
    renderedOptions: [],
  },

  observers: {
    'question, answer': function refreshOptions(question, answer) {
      if (!question || !Array.isArray(question.options)) {
        this.setData({ renderedOptions: [] })
        return
      }

      const selected = Array.isArray(answer) ? answer : [answer]
      this.setData({
        renderedOptions: question.options.map((item) => ({
          ...item,
          selected: selected.includes(item.id),
        })),
      })
    },
  },

  methods: {
    emitChange(value) {
      this.triggerEvent('change', { value })
    },

    onOptionTap(event) {
      const id = event.currentTarget.dataset.id
      const { question, answer } = this.data
      if (question.type === 'single') {
        this.emitChange(id)
        return
      }

      const values = Array.isArray(answer) ? answer.slice() : []
      const index = values.indexOf(id)
      if (index >= 0) {
        values.splice(index, 1)
      } else {
        const max = question.validation && question.validation.maxSelections
        if (max && values.length >= max) {
          wx.showToast({ title: `最多选择 ${max} 项`, icon: 'none' })
          return
        }
        values.push(id)
      }
      this.emitChange(values)
    },

    onInput(event) {
      this.emitChange(event.detail.value)
    },

    onLocationTap() {
      this.triggerEvent('location')
    },

    onChooseUpload() {
      this.triggerEvent('chooseupload')
    },

    onRemoveUpload(event) {
      this.triggerEvent('removeupload', { index: Number(event.currentTarget.dataset.index) })
    },

    onPreviewUpload(event) {
      this.triggerEvent('previewupload', { index: Number(event.currentTarget.dataset.index) })
    },

    onRankingChange(event) {
      this.emitChange(event.detail.value)
    },

    onRankingDragState(event) {
      this.triggerEvent('dragstate', event.detail)
    },
  },
})
