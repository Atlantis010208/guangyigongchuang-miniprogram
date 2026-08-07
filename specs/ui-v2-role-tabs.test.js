'use strict'
const assert = require('assert')
const { getRoleTabs } = require('../services/v2/role-tabs')
for (const role of ['owner', 'designer']) {
  const tabs = getRoleTabs(role)
  assert.strictEqual(tabs.length, 5, `${role} 必须恰好有五个槽位`)
  assert.deepStrictEqual(tabs.map(item => item.slot), [1, 2, 3, 4, 5])
  assert.strictEqual(new Set(tabs.map(item => item.url)).size, 5)
}
assert.deepStrictEqual(getRoleTabs('unknown'), [])
console.log('ui-v2 role tab specs passed')

const fs = require('fs')
const path = require('path')
const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8').replace(/^\uFEFF/, ''))
const registered = new Set(app.pages.map(route => `/${route}`))
;(app.subpackages || []).forEach(pkg => pkg.pages.forEach(route => registered.add(`/${pkg.root}${route}`)))
for (const role of ['owner', 'designer']) {
  getRoleTabs(role).forEach(tab => assert.ok(registered.has(tab.url), `unregistered ${role} tab route: ${tab.url}`))
}
