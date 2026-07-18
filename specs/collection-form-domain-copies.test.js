const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const canonical = fs.readFileSync(path.join(root, 'cloudfunctions/common/collection_form_domain.js'), 'utf8')
for (const functionName of ['admin_collection_forms', 'collection_form_public', 'admin_collection_form_submissions']) {
  const copy = fs.readFileSync(path.join(root, 'cloudfunctions', functionName, 'common/collection_form_domain.js'), 'utf8')
  assert.strictEqual(copy, canonical, `${functionName} 的领域逻辑副本已与主文件不一致`)
}
console.log('collection form domain copies are in sync')
