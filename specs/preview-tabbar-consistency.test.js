const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const sharedPath = path.join(previewRoot, 'shared', 'preview-tabbar.wxss')
const tabbarAssetRoot = path.join(previewRoot, 'shared', 'assets', 'tabbar')
const sharedWxss = fs.readFileSync(sharedPath, 'utf8')
const pages = ['owner-home']

for (const page of pages) {
  const pageRoot = path.join(previewRoot, page)
  const wxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')

  assert(
    wxss.startsWith('@import "../shared/preview-tabbar.wxss";'),
    page + ' must import the shared tab bar geometry'
  )
  assert(
    !/^\.preview-tabbar\s*\{/m.test(wxss),
    page + ' must not redefine the shared tab bar'
  )
  assert.strictEqual(
    (wxml.match(/class="tab-item/g) || []).length,
    4,
    page + ' must render exactly four tab items'
  )
  assert(
    wxml.includes('preview-tabbar__inner--owner-four'),
    page + ' must use the owner four-column tab bar layout'
  )
  assert(
    !wxml.includes('tab-profile-default.png') && !wxml.includes('tab-profile-active.png'),
    page + ' must keep profile access in the avatar instead of the tab bar'
  )
}

for (const requiredRule of [
  'height: 108rpx;',
  'padding-top: 8rpx;',
  'width: 56rpx;',
  'height: 52rpx;',
  'font-size: 20rpx;',
  'line-height: 28rpx;',
  'color: #858585;',
  'border-top: 1rpx solid #ebebeb;',
  'padding-bottom: env(safe-area-inset-bottom);',
]) {
  assert(sharedWxss.includes(requiredRule), 'missing shared rule: ' + requiredRule)
}

const homeWxss = fs.readFileSync(
  path.join(previewRoot, 'owner-home', 'index.wxss'),
  'utf8'
)
const casesWxml = fs.readFileSync(
  path.join(previewRoot, 'owner-cases', 'content', 'index.wxml'),
  'utf8'
)
assert(homeWxss.includes('calc(108rpx + env(safe-area-inset-bottom))'))
assert(casesWxml.includes('padding-bottom: calc(108rpx + env(safe-area-inset-bottom)'))

function pngDimensions(filePath) {
  const file = fs.readFileSync(filePath)
  assert.strictEqual(file.toString('ascii', 1, 4), 'PNG')
  return [file.readUInt32BE(16), file.readUInt32BE(20)]
}

const iconNames = [
  'home',
  'cases',
  'services',
  'tools',
  'learning',
  'designer-tools',
  'projects',
]
for (const icon of iconNames) {
  for (const state of ['default', 'active']) {
    const fileName = `tab-${icon}-${state}.png`
    assert.deepStrictEqual(
      pngDimensions(path.join(tabbarAssetRoot, fileName)),
      [64, 60],
      fileName + ' must use the canonical canvas'
    )
  }
}

for (const selector of [
  '.tab-icon-stack',
  '.tab-icon-layer',
  '.tab-icon-layer--visible',
]) {
  assert(sharedWxss.includes(selector), 'missing stable icon layer: ' + selector)
}

assert(!sharedWxss.includes('.designer-tab-icon'))

console.log('preview tab bar consistency: ok')
