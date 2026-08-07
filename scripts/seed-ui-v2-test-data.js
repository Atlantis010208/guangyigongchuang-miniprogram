'use strict'
const fs = require('fs')
const path = require('path')
const { PRODUCTION_ENV_ID } = require('../config/cloud-env')

const envIndex = process.argv.indexOf('--env-id')
const outIndex = process.argv.indexOf('--out')
const envId = envIndex >= 0 ? String(process.argv[envIndex + 1] || '') : String(process.argv[2] || '')
const outputRoot = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : 'dist/ui-v2-test-seed')
if (!envId) throw new Error('必须传入 --env-id <独立测试环境ID>')
if (envId === PRODUCTION_ENV_ID) throw new Error('拒绝向生产环境生成或导入测试数据')
const source = JSON.parse(fs.readFileSync(path.resolve('fixtures/ui-v2-test/seed.json'), 'utf8').replace(/^\uFEFF/, ''))
fs.mkdirSync(outputRoot, { recursive: true })
for (const [collection, rows] of Object.entries(source)) {
  fs.writeFileSync(path.join(outputRoot, `${collection}.json`), JSON.stringify(rows, null, 2) + '\n')
}
fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify({ envId, generatedAt: new Date().toISOString(), collections: Object.keys(source) }, null, 2) + '\n')
console.log(`已生成匿名测试数据：${outputRoot}`)
console.log('只允许导入 manifest.json 中记录的独立测试环境。')
