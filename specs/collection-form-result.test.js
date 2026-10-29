const assert = require('assert')

let pageDefinition
const copies = []
const opened = []
const toasts = []

global.wx = {
  env: { USER_DATA_PATH: '/user-data' },
  cloud: {
    async downloadFile() { return { tempFilePath: '/tmp/random-download.pdf' } },
  },
  getFileSystemManager() {
    return { copyFileSync(srcPath, destPath) { copies.push({ srcPath, destPath }) } }
  },
  openDocument(options) {
    opened.push(options)
    options.success()
  },
  showToast(options) { toasts.push(options) },
}
global.Page = (definition) => { pageDefinition = definition }

require('../pages/flows/collection-form-result/collection-form-result')

function createPage() {
  const page = {
    ...pageDefinition,
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(patch) { Object.assign(this.data, patch) },
  }
  Object.keys(pageDefinition).forEach((key) => {
    if (typeof pageDefinition[key] === 'function') page[key] = pageDefinition[key].bind(page)
  })
  return page
}

;(async () => {
  const page = createPage()
  page.setData({
    pdfStatus: 'ready',
    pdfFileID: 'cloud://test/collection-form.pdf',
    pdfFileName: '张三+灯光设计需求收集.pdf',
  })

  await page.onOpenPdf()

  const expectedPath = '/user-data/张三+灯光设计需求收集.pdf'
  assert.deepStrictEqual(copies, [{ srcPath: '/tmp/random-download.pdf', destPath: expectedPath }])
  assert.strictEqual(opened.length, 1)
  assert.strictEqual(opened[0].filePath, expectedPath)
  assert.strictEqual(opened[0].fileType, 'pdf')
  assert.strictEqual(opened[0].showMenu, true)
  assert.strictEqual(page.data.opening, false)
  assert.deepStrictEqual(toasts, [])

  console.log('collection form result PDF filename tests passed')
})().catch((error) => { console.error(error); process.exit(1) })
