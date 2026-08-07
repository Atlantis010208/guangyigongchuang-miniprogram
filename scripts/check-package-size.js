'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''))
const app = readJson('app.json')
const project = readJson('project.config.json')
const normalize = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
const subRoots = new Set((app.subpackages || []).map(item => normalize(item.root)))
const packIgnores = (project.packOptions && project.packOptions.ignore) || []
const ignoredFolders = new Set(packIgnores.filter(item => item.type === 'folder').map(item => normalize(item.value)))
const ignoredFiles = new Set(packIgnores.filter(item => item.type === 'file').map(item => normalize(item.value)))
const ignoredSuffixes = packIgnores.filter(item => item.type === 'suffix').map(item => normalize(item.value).replace(/^\*/, ''))
const alwaysIgnore = new Set(['node_modules','cloudfunctions','specs','scripts','docs','fixtures','dist','.git','.cloudbase-deploy','deploy','.figma-ref','tmp'])
function under(rel, roots) { return [...roots].some(root => rel === root || rel.startsWith(root + '/')) }
function ignoredFile(rel) { return ignoredFiles.has(rel) || ignoredSuffixes.some(suffix => rel.endsWith(suffix)) || rel === 'project.private.config.json' }
let bytes = 0
const files = []
function walk(dir, relative = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(relative, entry.name)
    const first = rel.split('/')[0]
    if (entry.isDirectory() && (alwaysIgnore.has(first) || under(rel, ignoredFolders) || under(rel, subRoots))) continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(absolute, rel)
    else if (!ignoredFile(rel)) { const size=fs.statSync(absolute).size; bytes += size; files.push({rel,size}) }
  }
}
walk(root)
const limit = 2 * 1024 * 1024
console.log(`Estimated main package: ${(bytes / 1024).toFixed(1)} KB / 2048 KB`)
files.sort((a,b)=>b.size-a.size).slice(0,20).forEach(file=>console.log(`${(file.size/1024).toFixed(1)} KB\t${file.rel}`))
if (bytes >= limit) { console.error('Main package exceeds 2 MB'); process.exit(1) }
