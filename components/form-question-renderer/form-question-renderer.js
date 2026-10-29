Component({
  properties: {
    question: { type: Object, value: {} },
    answer: { type: null, value: null },
  },

  data: {
    renderedOptions: [],
    answerLength: 0,
    maxLength: 500,
    otherOption: null,
    otherSelected: false,
    otherText: '',
    otherMaxLength: 100,
    otherInputFocus: false,
    tableRows: [],
    tableRenderedRows: [],
    tableMaxRows: 100,
  },

  observers: {
    'question, answer': function refreshOptions(question, answer) {
      const validation = (question && question.validation) || {}
      const fallbackMaxLength = question && question.type === 'shortText' ? 140 : 500
      const commonData = {
        answerLength: typeof answer === 'string' ? answer.length : 0,
        maxLength: validation.maxLength || fallbackMaxLength,
      }

      if (question && question.type === 'table') {
        const rows = Array.isArray(answer) ? answer.map((row) => ({ ...row })) : []
        const minRows = Math.max(0, Number((question.table && question.table.minRows) || 0))
        while (rows.length < minRows) rows.push({})
        this.setData({ ...commonData, renderedOptions: [], tableRows: rows, tableRenderedRows: this.buildTableRenderedRows((question.table && question.table.columns) || [], rows), tableMaxRows: Math.min(100, Math.max(1, Number((question.table && question.table.maxRows) || 100))) })
        return
      }

      if (!question || !Array.isArray(question.options)) {
        this.setData({ ...commonData, renderedOptions: [] })
        return
      }

      const structured = answer && typeof answer === 'object' && !Array.isArray(answer) && Object.prototype.hasOwnProperty.call(answer, 'selected') ? answer : null
      const rawSelected = structured ? structured.selected : answer
      const selected = Array.isArray(rawSelected) ? rawSelected : [rawSelected]
      const otherOption = question.options.find((item) => item.isOther)
      const otherSelected = Boolean(otherOption && selected.includes(otherOption.id))
      this.setData({
        ...commonData,
        renderedOptions: question.options.map((item) => ({
          ...item,
          selected: selected.includes(item.id),
        })),
        otherOption: otherSelected ? otherOption : null,
        otherSelected,
        otherText: structured && typeof structured.otherText === 'string' ? structured.otherText : '',
        otherMaxLength: (otherOption && otherOption.otherMaxLength) || 100,
        ...(!otherSelected ? { otherInputFocus: false } : {}),
      })
    },
  },

  methods: {
    emitChange(value, confirmed = false) {
      this.triggerEvent('change', { value, confirmed })
    },

    choiceState(answer) {
      const structured = answer && typeof answer === 'object' && !Array.isArray(answer) && Object.prototype.hasOwnProperty.call(answer, 'selected') ? answer : null
      const rawSelected = structured ? structured.selected : answer
      const selected = Array.isArray(rawSelected) ? rawSelected.slice() : (typeof rawSelected === 'string' && rawSelected ? [rawSelected] : [])
      return { selected, otherText: structured && typeof structured.otherText === 'string' ? structured.otherText : '' }
    },

    choiceAnswer(question, selected, otherText) {
      if (!(question.options || []).some((option) => option.isOther)) {
        return question.type === 'single' ? (selected[0] || '') : selected
      }
      return {
        selected: question.type === 'single' ? (selected[0] || '') : selected,
        otherText: otherText || '',
      }
    },

    normalizeOptionId(options, value) {
      const text = String(value === undefined || value === null ? '' : value).trim()
      if (!text) return ''
      const list = Array.isArray(options) ? options : []
      const exact = list.find((option) => String(option && option.id || '').trim() === text)
      if (exact) return exact.id
      const byLabel = list.find((option) => String(option && option.label || '').trim() === text)
      return byLabel ? byLabel.id : text
    },

    focusOtherInput() {
      this.setData({ otherInputFocus: false }, () => {
        this.setData({ otherInputFocus: true })
      })
    },
    onOptionTap(event) {
      const { question, answer } = this.data
      const id = this.normalizeOptionId(question.options, event.currentTarget.dataset.id)
      if (!id) return
      const state = this.choiceState(answer)
      const option = (question.options || []).find((item) => item.id === id)
      if (question.type === 'single') {
        this.emitChange(this.choiceAnswer(question, [id], option && option.isOther ? state.otherText : ''), !(option && option.isOther))
        if (option && option.isOther) this.focusOtherInput()
        return
      }

      const values = state.selected
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
      const otherText = option && option.isOther && index >= 0 ? '' : state.otherText
      this.emitChange(this.choiceAnswer(question, values, otherText))
      if (option && option.isOther && index < 0) this.focusOtherInput()
    },

    onOtherInput(event) {
      const { question, answer } = this.data
      const state = this.choiceState(answer)
      this.emitChange(this.choiceAnswer(question, state.selected, event.detail.value))
    },

    onOtherConfirm(event) {
      const { question, answer } = this.data
      const state = this.choiceState(answer)
      this.emitChange(this.choiceAnswer(question, state.selected, event.detail.value), question.type === 'single')
    },

    onOtherBlur() {
      this.setData({ otherInputFocus: false })
    },

    onInput(event) {
      this.emitChange(event.detail.value)
    },

    onInputConfirm(event) {
      this.emitChange(event.detail.value, true)
    },

    onLocationTap() {
      this.triggerEvent('location')
    },

    buildTableRenderedRows(columns, rows) {
      return rows.map((values, rowIndex) => ({
        rowIndex,
        values,
        columns: columns.map((column) => {
          const value = values[column.id]
          const selected = Array.isArray(value) ? value : (typeof value === 'string' && value ? [value] : [])
          return { ...column, renderedOptions: (column.options || []).map((option) => ({ ...option, selected: selected.includes(option.id) })) }
        }),
      }))
    },

    updateTableCell(rowIndex, columnId, value) {
      const rows = this.data.tableRows.map((row) => ({ ...row }))
      rows[rowIndex] = { ...(rows[rowIndex] || {}), [columnId]: value }
      this.emitChange(rows)
    },
    onTableCellInput(event) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const columnId = event.currentTarget.dataset.columnId
      this.updateTableCell(rowIndex, columnId, event.detail.value)
    },

    onTableOptionTap(event) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const columnId = event.currentTarget.dataset.columnId
      const column = ((this.data.question.table && this.data.question.table.columns) || []).find((item) => item.id === columnId)
      if (!column) return
      const optionId = this.normalizeOptionId(column.options, event.currentTarget.dataset.optionId)
      if (!optionId) return
      if (column.type === 'single') {
        this.updateTableCell(rowIndex, columnId, optionId)
        return
      }
      const current = this.data.tableRows[rowIndex] && this.data.tableRows[rowIndex][columnId]
      const selected = Array.isArray(current) ? current.slice() : []
      const optionIndex = selected.indexOf(optionId)
      if (optionIndex >= 0) selected.splice(optionIndex, 1)
      else {
        const max = column.validation && column.validation.maxSelections
        if (max && selected.length >= max) {
          wx.showToast({ title: `最多选择 ${max} 项`, icon: 'none' })
          return
        }
        selected.push(optionId)
      }
      this.updateTableCell(rowIndex, columnId, selected)
    },

    onAddTableRow() {
      const table = this.data.question.table || {}
      const rows = this.data.tableRows.map((row) => ({ ...row }))
      const maxRows = this.data.tableMaxRows || 100
      if (rows.length >= maxRows) {
        wx.showToast({ title: `最多添加 ${maxRows} 行`, icon: 'none' })
        return
      }
      this.emitChange([...rows, {}])
    },

    onRemoveTableRow(event) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const table = this.data.question.table || {}
      if (this.data.tableRows.length <= Number(table.minRows || 0)) return
      this.emitChange(this.data.tableRows.filter((_, index) => index !== rowIndex))
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
