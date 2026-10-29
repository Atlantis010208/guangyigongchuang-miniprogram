const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'profile', 'home')
const pageJs = fs.readFileSync(path.join(pageRoot, 'home.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(pageRoot, 'home.wxml'), 'utf8')

assert(pageWxml.includes('bindtap="goDesigner"'))
assert(pageWxml.includes('设计师工作台'))
assert(!pageWxml.includes('wx:if="{{isDesigner || isAdmin}}"'))
assert(pageJs.includes("name: 'user_set_identity'"))
assert(pageJs.includes('data: { role: 2 }'))
assert(pageJs.includes("wx.setStorageSync('userRole', 'designer')"))

console.log('owner profile designer entry checks passed')
