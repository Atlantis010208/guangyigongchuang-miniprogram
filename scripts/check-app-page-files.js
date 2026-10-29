'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'app.json')
const app = JSON.parse(fs.readFileSync(appPath, 'utf8').replace(/^\uFEFF/, ''))
const exts = ['.wxml', '.js', '.json', '.wxss']
const missing = []
const invalidFiles = []
function normalize(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')
}
function walk(dir, visitor) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(absolute, visitor)
    } else {
      visitor(absolute)
    }
  }
}

function checkSourceFile(filePath) {
  const bytes = fs.readFileSync(filePath)
  const relative = path.relative(root, filePath).replace(/\\/g, '/')
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    invalidFiles.push({ file: relative, reason: 'UTF-8 BOM is not accepted by WeChat DevTools compiler' })
    return
  }
  if (filePath.endsWith('.json')) {
    try {
      JSON.parse(bytes.toString('utf8'))
    } catch (error) {
      invalidFiles.push({ file: relative, reason: error.message })
    }
  }
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
for (const dir of ['pages', 'components']) {
  const absolute = path.join(root, dir)
  if (fs.existsSync(absolute)) {
    walk(absolute, (filePath) => {
      if (/\.(?:json|wxml|wxss|js)$/.test(filePath)) checkSourceFile(filePath)
    })
  }
}

if (invalidFiles.length) {
  console.error('Invalid mini program source files:')
  for (const item of invalidFiles) console.error(`- ${item.file}: ${item.reason}`)
  process.exit(1)
}

if (missing.length) {
  console.error('Missing mini program page files:')
  for (const item of missing) console.error(`- ${item.label}: ${item.file}`)
  process.exit(1)
}
console.log('Mini program page registration check passed')
