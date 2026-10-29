const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'lighting-manual')
const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const pageWxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')

assert(pageWxml.includes('bindtap="goMoreCases"'))
assert(pageWxml.includes('class="case-more-btn"'))
assert(pageWxml.includes('查看更多案例'))
assert(!pageWxml.includes('case-more-count'))
assert(!pageWxml.includes('case-more-arrow'))
assert(!pageWxml.includes('arrow-right'))
assert(pageWxml.includes('case-space-badge'))
assert(pageWxss.includes('.case-more-btn'))
assert(!pageWxss.includes('.case-more-count'))
assert(!pageWxss.includes('.case-more-arrow'))
assert(!pageWxss.includes('.arrow-right'))
assert(pageWxss.includes('.case-space-badge'))
assert(pageJs.includes("url: '/pages/v2/owner-home/index?tab=cases'"))
assert(pageJs.includes('casesData: casesData.slice(0, 4)'))

let pageDefinition
const routes = []
const cloudCalls = []

vm.runInNewContext(pageJs, {
  Page(definition) {
    pageDefinition = definition
  },
  console,
  setTimeout,
  clearTimeout,
  wx: {
    cloud: {
      callFunction(options) {
        cloudCalls.push(options)
        if (options.name === 'lighting_cases_list') {
          return Promise.resolve({
            result: {
              data: {
                items: Array.from({ length: 6 }, (_, index) => ({
                  _id: `case-${index}`,
                  title: `case ${index}`,
                  imageUrls: [`cloud://case-${index}.jpg`],
                })),
              },
            },
          })
        }
        return Promise.resolve({ result: { data: { items: [] } } })
      },
    },
    navigateTo(options) {
      routes.push(options.url)
    },
    showToast() {},
  },
})

assert(pageDefinition)

const page = {
  ...pageDefinition,
  data: { ...pageDefinition.data },
  setData(patch) {
    Object.assign(this.data, patch)
  },
}

page.goMoreCases()
assert.deepStrictEqual(routes, ['/pages/v2/owner-home/index?tab=cases'])

page.loadContent().then(() => {
  assert.strictEqual(page.data.casesData.length, 4)
  assert.strictEqual(page.data.casesTotal, 6)
  assert(cloudCalls.some((item) => item.name === 'lighting_cases_list' && item.data.limit === 20))
  console.log('lighting manual cases preview checks passed')
})
