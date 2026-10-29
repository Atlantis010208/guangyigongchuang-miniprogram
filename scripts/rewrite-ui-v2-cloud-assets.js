'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const V2_ROOT = path.join(ROOT, 'pages', 'v2')
const ENV_ID = 'cloud1-5gb9c5u2c58ad6d7'
const BUCKET = '636c-cloud1-5gb9c5u2c58ad6d7-1378684587'
const CLOUD_PREFIX = `cloud://${ENV_ID}.${BUCKET}/ui-v2-assets/`
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const SOURCE_EXTENSIONS = new Set(['.js', '.wxml', '.wxss'])
const PACKAGED_ASSET_PATHS = new Set([
  'pages/v2/designer-workbench/assets/icon-tab-learning-v2.png',
  'pages/v2/designer-workbench/assets/icon-tab-tools-v2.png',
  'pages/v2/designer-workbench/assets/icon-tab-projects-v2.png',
  'pages/v2/designer-workbench/assets/icon-tab-profile-v2.png',
  'pages/v2/designer-workbench/assets/icon-tab-workbench-v2.png',
])
const PACKAGED_TABBAR_PREFIX = 'pages/v2/shared/assets/tabbar/'

function isPackagedAsset(projectPath) {
  return PACKAGED_ASSET_PATHS.has(projectPath)
    || projectPath.startsWith(PACKAGED_TABBAR_PREFIX)
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function walk(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, predicate, output)
    } else if (!predicate || predicate(fullPath)) {
      output.push(fullPath)
    }
  }
  return output
}

function getCloudUrl(projectRelativePath) {
  return CLOUD_PREFIX + projectRelativePath
}

const assetFiles = walk(V2_ROOT, filePath => (
  filePath.includes(`${path.sep}assets${path.sep}`)
    && IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
))

const assetByProjectPath = new Map()
for (const filePath of assetFiles) {
  const projectPath = toPosix(path.relative(ROOT, filePath))
  if (projectPath.startsWith(PACKAGED_TABBAR_PREFIX)) continue
  assetByProjectPath.set(projectPath, getCloudUrl(projectPath))
}

const sourceFiles = walk(V2_ROOT, filePath => (
  SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
))

let changed = 0
const replacements = []

for (const filePath of sourceFiles) {
  const before = fs.readFileSync(filePath, 'utf8')
  let after = before
  const sourceDir = path.dirname(filePath)

  for (const [projectPath, cloudUrl] of assetByProjectPath.entries()) {
    if (isPackagedAsset(projectPath)) continue
    after = after.split('/' + projectPath).join(cloudUrl)
  }

  after = after.replace(/(?:\.\.?\/)+[^'"`\s)]*assets\/[^'"`\s)]*\.(?:png|jpe?g|webp|gif|svg)/gi, match => {
    const absoluteAssetPath = path.resolve(sourceDir, match)
    const projectPath = toPosix(path.relative(ROOT, absoluteAssetPath))
    if (isPackagedAsset(projectPath)) return match
    const cloudUrl = assetByProjectPath.get(projectPath)
    return cloudUrl || match
  })

  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8')
    changed += 1
    replacements.push(toPosix(path.relative(ROOT, filePath)))
  }
}

const manifest = {
  envId: ENV_ID,
  bucket: BUCKET,
  prefix: CLOUD_PREFIX,
  generatedAt: new Date().toISOString(),
  assets: Object.fromEntries([...assetByProjectPath.entries()].sort()),
}

const manifestPath = path.join(ROOT, 'pages', 'v2', 'shared', 'cloud-assets-manifest.json')
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

console.log(`cloud asset refs rewritten: ${changed}`)
for (const file of replacements) console.log(`- ${file}`)
console.log(`manifest: ${toPosix(path.relative(ROOT, manifestPath))}`)
