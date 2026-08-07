'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
function readArg(name) {
  const prefix = `--${name}=`
  const inline = process.argv.find(arg => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : ''
}
const ownerOpenids = String(readArg('owner-openids') || '').split(',').map(v => v.trim()).filter(Boolean)
const designerOpenids = String(readArg('designer-openids') || '').split(',').map(v => v.trim()).filter(Boolean)
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const document = {
  _id: 'miniprogram_ui_v2', enabled: false, uiVersion: 'v2',
  ownerEnabled: false, designerEnabled: false, ownerPercent: 0, designerPercent: 0,
  ownerWhitelistHashes: ownerOpenids.map(hash), designerWhitelistHashes: designerOpenids.map(hash),
  updatedAt: new Date().toISOString()
}
const output = path.resolve(__dirname, '..', 'dist', 'ui-v2-gate', 'miniprogram_ui_v2.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(document, null, 2) + '\n')
console.log(`已生成默认关闭的灰度配置: ${output}`)
console.log('该脚本只生成导入文件，不连接任何 CloudBase 环境。')
