const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '..')
const tabbarJs = fs.readFileSync(path.join(root, 'custom-tab-bar/index.js'), 'utf8')
const tabbarWxml = fs.readFileSync(path.join(root, 'custom-tab-bar/index.wxml'), 'utf8')
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

assert(tabbarWxml.includes('wx:if="{{show}}"'), 'custom tabBar should use show flag instead of removing tabBar globally')
assert(!tabbarJs.includes("pagePath: '/pages/mall/mall'"), 'mall should not exist in the custom tabBar')
assert(
  !appConfig.tabBar.list.some((item) => item.pagePath === 'pages/mall/mall'),
  'mall should be a normal page instead of a tabBar page'
)
assert(appConfig.pages.includes('pages/mall/mall'), 'mall should remain registered as a normal page')

console.log('custom tabBar standalone mall specs passed')
