'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'app.json')
const app = JSON.parse(fs.readFileSync(appPath, 'utf8').replace(/^\uFEFF/, ''))
const exts = ['.wxml', '.js', '.json', '.wxss']
const missing = []
function normalize(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')
}
function checkPage(route, label) {
  const cleanRoute = normalize(route).replace(/^\//, '').replace(/\/$/, '')
  for (const ext of exts) {
    const rel = cleanRoute + ext
    if (!fs.existsSync(path.join(root, rel))) {
      missing.push({ label, file: rel })
    }
  }
}
;(app.pages || []).forEach((route, index) => checkPage(route, `pages[${index}]`))
;(app.subpackages || app.subPackages || []).forEach((subpackage, packageIndex) => {
  const packageRoot = normalize(subpackage.root).replace(/\/$/, '')
  ;(subpackage.pages || []).forEach((route, pageIndex) => {
    checkPage(`${packageRoot}/${normalize(route)}`, `subpackages[${packageIndex}].pages[${pageIndex}]`)
  })
})
if (missing.length) {
  console.error('Missing mini program page files:')
  for (const item of missing) console.error(`- ${item.label}: ${item.file}`)
  process.exit(1)
}
console.log('Mini program page registration check passed')
