const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(
  root,
  'pages',
  'v2',
  'designer-workbench'
)
const assetRoot = path.join(pageRoot, 'assets')
const tabbarAssetRoot = path.join(root, 'pages', 'v2', 'shared', 'assets', 'tabbar')
const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const pageWxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
const sharedTabbarWxss = fs.readFileSync(
  path.join(root, 'pages', 'v2', 'shared', 'preview-tabbar.wxss'),
  'utf8'
)

const expectedIcons = {
  'icon-quick-illuminance-v2.png': [48, 48],
  'icon-quick-temperature-v2.png': [48, 48],
  'icon-quick-checklist-v2.png': [48, 48],
  'icon-chevron-right-v2.png': [24, 24],
}
const expectedTabIcons = [
  'tab-home-default.png',
  'tab-home-active.png',
  'tab-learning-default.png',
  'tab-learning-active.png',
  'tab-designer-tools-default.png',
  'tab-designer-tools-active.png',
  'tab-projects-default.png',
  'tab-projects-active.png',
  'tab-profile-default.png',
  'tab-profile-active.png',
]

function readPngMetadata(filePath) {
  const file = fs.readFileSync(filePath)
  assert.strictEqual(
    file.subarray(1, 4).toString('ascii'),
    'PNG',
    path.basename(filePath) + ' must be PNG'
  )
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    colorType: file[25],
    size: file.length,
  }
}

for (const [fileName, expectedSize] of Object.entries(expectedIcons)) {
  const filePath = path.join(assetRoot, fileName)
  assert(fs.existsSync(filePath), 'missing generated icon: ' + fileName)
  const metadata = readPngMetadata(filePath)
  assert.deepStrictEqual(
    [metadata.width, metadata.height],
    expectedSize,
    fileName + ' must use its canonical canvas'
  )
  assert.strictEqual(
    metadata.colorType,
    6,
    fileName + ' must retain an RGBA transparency channel'
  )
  assert(
    metadata.size < 20 * 1024,
    fileName + ' must be compressed for the mini-program package'
  )
}

for (const fileName of expectedTabIcons) {
  const filePath = path.join(tabbarAssetRoot, fileName)
  assert(fs.existsSync(filePath), 'missing generated tab icon: ' + fileName)
  const metadata = readPngMetadata(filePath)
  assert.deepStrictEqual([metadata.width, metadata.height], [64, 60])
  assert.strictEqual(metadata.colorType, 6)
  assert(metadata.size < 20 * 1024)
  assert(pageJs.includes(fileName), 'tab icon is not consumed: ' + fileName)
}

for (const fileName of Object.keys(expectedIcons)) {
  const source = fileName === 'icon-chevron-right-v2.png'
    ? pageWxml
    : pageJs
  assert(source.includes(fileName), 'icon is not consumed: ' + fileName)
}

assert(
  /<image\s+class="quick-tool-icon"[\s\S]*?src="\{\{item\.icon\}\}"/.test(
    pageWxml
  ),
  'quick tools must render the generated raster icons'
)
assert(pageWxml.includes('class="tab-icon-stack"'))
assert(pageWxml.includes('src="{{item.icon}}"'))
assert(pageWxml.includes('src="{{item.activeIcon}}"'))
assert.strictEqual((pageWxml.match(/fade-in="\{\{false\}\}"/g) || []).length >= 2, true)
assert.strictEqual(
  (pageWxml.match(/icon-chevron-right-v2\.png/g) || []).length,
  4,
  'all four visible chevrons must use the generated icon'
)

assert(!pageJs.includes('ui-v2-assets/pages/v2/shared/assets/tabbar/'))
assert(
  !/generated-icons|#00ff00/i.test(pageJs + pageWxml),
  'chroma source images must never be referenced by the page'
)
assert(sharedTabbarWxss.includes('.tab-icon-layer--visible'))
assert(!sharedTabbarWxss.includes('.designer-tab-icon'))

console.log('designer-workbench generated icon assets: ok')
