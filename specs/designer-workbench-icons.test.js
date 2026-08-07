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
const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const pageWxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')

const expectedIcons = {
  'icon-tab-workbench-v2.png': [64, 60],
  'icon-tab-learning-v2.png': [64, 60],
  'icon-tab-tools-v2.png': [64, 60],
  'icon-tab-projects-v2.png': [64, 60],
  'icon-tab-profile-v2.png': [64, 60],
  'icon-quick-illuminance-v2.png': [48, 48],
  'icon-quick-temperature-v2.png': [48, 48],
  'icon-quick-checklist-v2.png': [48, 48],
  'icon-chevron-right-v2.png': [24, 24],
}

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
assert(
  /<image\s+class="designer-tab-icon"[\s\S]*?src="\{\{item\.icon\}\}"/.test(
    pageWxml
  ),
  'bottom navigation must render the generated raster icons'
)
assert.strictEqual(
  (pageWxml.match(/icon-chevron-right-v2\.png/g) || []).length,
  4,
  'all four visible chevrons must use the generated icon'
)

assert(
  !/quick-tool-icon--|designer-tab-icon--/.test(pageWxml + pageWxss),
  'legacy CSS-drawn icon variants must be removed'
)
assert(
  !/generated-icons|#00ff00/i.test(pageJs + pageWxml),
  'chroma source images must never be referenced by the page'
)
assert(
  /\.tab-item--active \.designer-tab-icon\s*\{[\s\S]*?opacity:\s*1;/.test(
    pageWxss
  ),
  'the active workbench icon must retain the solid selected state'
)

console.log('designer-workbench generated icon assets: ok')
