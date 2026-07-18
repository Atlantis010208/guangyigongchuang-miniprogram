const assert = require('assert')
const fs = require('fs')
const path = require('path')

let pageDefinition
global.Page = (definition) => {
  pageDefinition = definition
}

require('../pages/flows/collection-form/collection-form')

function createContext() {
  return {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch)
    },
  }
}

const context = createContext()
pageDefinition.handleKeyboardHeightChange.call(context, { height: 320 })
assert.strictEqual(context.data.keyboardHeight, 320)
assert.strictEqual(context.data.bottomBarStyle, 'bottom: 320px; padding-bottom: 20rpx;')

pageDefinition.handleKeyboardHeightChange.call(context, { height: 0 })
assert.strictEqual(context.data.keyboardHeight, 0)
assert.strictEqual(context.data.bottomBarStyle, '')

pageDefinition.handleKeyboardHeightChange.call(context, { height: -20 })
assert.strictEqual(context.data.keyboardHeight, 0)

let removedHandler = null
let autoAdvanceCancelled = false
global.wx = {
  offKeyboardHeightChange(handler) {
    removedHandler = handler
  },
}
const keyboardHandler = () => {}
pageDefinition.onUnload.call({
  keyboardHeightHandler: keyboardHandler,
  cancelAutoAdvance() {
    autoAdvanceCancelled = true
  },
})
assert.strictEqual(removedHandler, keyboardHandler)
assert.strictEqual(autoAdvanceCancelled, true)

const root = path.resolve(__dirname, '..')
const pageWxml = fs.readFileSync(path.join(root, 'pages/flows/collection-form/collection-form.wxml'), 'utf8')
const pageWxss = fs.readFileSync(path.join(root, 'pages/flows/collection-form/collection-form.wxss'), 'utf8')
const rendererWxml = fs.readFileSync(path.join(root, 'components/form-question-renderer/form-question-renderer.wxml'), 'utf8')

assert.match(pageWxml, /class="bottom-bar" style="\{\{bottomBarStyle\}\}"/)
assert.match(pageWxss, /transition:\s*bottom 180ms/)
assert.strictEqual((rendererWxml.match(/adjust-position="\{\{false\}\}"/g) || []).length, 6)

console.log('collection form keyboard tests passed')
