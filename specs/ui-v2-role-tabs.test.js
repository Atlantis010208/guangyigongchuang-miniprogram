'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { getRoleTabs } = require('../services/v2/role-tabs')
const { V2_ROUTES } = require('../services/v2/navigation-gate')
const ownerTabs = getRoleTabs('owner')
const designerTabs = getRoleTabs('designer')
assert.strictEqual(ownerTabs.length, 5, 'owner 必须恰好有五个槽位')
assert.deepStrictEqual(ownerTabs.map(item => item.slot), [1, 2, 3, 4, 5])
assert.strictEqual(new Set(ownerTabs.map(item => item.url)).size, 5)
assert.strictEqual(designerTabs.length, 4, 'designer 必须恰好有四个槽位')
assert.deepStrictEqual(designerTabs.map(item => item.slot), [1, 2, 3, 4])
assert.deepStrictEqual(designerTabs.map(item => item.text), ['学习', '工具', '项目', '我的'])
assert.strictEqual(new Set(designerTabs.map(item => item.url)).size, 4)
assert.ok(!designerTabs.some(item => item.url.includes('designer-workbench')))
assert.strictEqual(V2_ROUTES.designer, '/pages/v2/designer-learning/index')
const root = path.resolve(__dirname, '..')
const sharedTabbarStyle = fs.readFileSync(path.join(root, 'pages/v2/shared/preview-tabbar.wxss'), 'utf8')
assert.ok(sharedTabbarStyle.includes('.preview-tabbar__inner--designer-four'))
assert.ok(sharedTabbarStyle.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'))
for (const page of ['designer-learning', 'designer-tools', 'designer-projects', 'designer-profile']) {
  const wxml = fs.readFileSync(path.join(root, 'pages/v2', page, 'index.wxml'), 'utf8')
  assert.ok(wxml.includes('preview-tabbar__inner--designer-four'), `${page} 必须使用四栏导航布局`)
}
assert.deepStrictEqual(getRoleTabs('unknown'), [])
console.log('ui-v2 role tab specs passed')

const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8').replace(/^\uFEFF/, ''))
const registered = new Set(app.pages.map(route => `/${route}`))
;(app.subpackages || []).forEach(pkg => pkg.pages.forEach(route => registered.add(`/${pkg.root}${route}`)))
for (const role of ['owner', 'designer']) {
  getRoleTabs(role).forEach(tab => assert.ok(registered.has(tab.url), `unregistered ${role} tab route: ${tab.url}`))
}
