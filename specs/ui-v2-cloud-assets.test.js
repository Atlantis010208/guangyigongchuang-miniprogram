'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const v2Root = path.join(root, 'pages', 'v2')
const manifestPath = path.join(v2Root, 'shared', 'cloud-assets-manifest.json')

function slash(filePath) {
  return filePath.split(path.sep).join('/')
}

function walk(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, predicate, results)
    } else if (predicate(fullPath)) {
      results.push(fullPath)
    }
  }

  return results
}

assert(fs.existsSync(manifestPath), 'cloud asset manifest is missing')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const imageExt = /\.(png|jpe?g|webp|gif|svg)$/i
const sourceExt = /\.(js|wxml|wxss)$/i
const expectedPrefix = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/ui-v2-assets/'

assert.strictEqual(manifest.envId, 'cloud1-5gb9c5u2c58ad6d7')
assert.strictEqual(manifest.bucket, '636c-cloud1-5gb9c5u2c58ad6d7-1378684587')
assert.strictEqual(manifest.prefix, expectedPrefix)

const assetFiles = walk(
  v2Root,
  file => file.includes(`${path.sep}assets${path.sep}`) && imageExt.test(file)
)
const packagedTabbarRoot = path.join(v2Root, 'shared', 'assets', 'tabbar') + path.sep
const cloudAssetFiles = assetFiles.filter(file => !file.startsWith(packagedTabbarRoot))
const manifestKeys = Object.keys(manifest.assets)

assert.strictEqual(
  manifestKeys.length,
  cloudAssetFiles.length,
  'manifest should contain every cloud-managed v2 image asset'
)

for (const file of cloudAssetFiles) {
  const key = slash(path.relative(root, file))
  assert.strictEqual(manifest.assets[key], `${expectedPrefix}${key}`)
  assert(fs.statSync(file).size > 0, `asset file is empty: ${key}`)
}

const manifestUrls = new Set(Object.values(manifest.assets))
const sourceFiles = walk(v2Root, file => sourceExt.test(file))
const localAssetPattern = /(?:src=["']|image:\s*["']|icon:\s*["']|value:\s*["']|url\(["']?)(?!(?:cloud|https?):)(?:\.{1,2}\/|\/pages\/v2\/)[^"')\s]*assets\/[^"')\s]*\.(?:png|jpe?g|webp|gif|svg)/i
const packagedTabIconPattern = /\/pages\/v2\/(?:designer-workbench\/assets\/icon-tab-(?:learning|tools|projects|profile|workbench)-v2|shared\/assets\/tabbar\/tab-[a-z-]+-(?:default|active))\.png/g
const cloudAssetPattern = /cloud:\/\/cloud1-5gb9c5u2c58ad6d7\.636c-cloud1-5gb9c5u2c58ad6d7-1378684587\/ui-v2-assets\/[^'"`\s)]+/g

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  const relativePath = slash(path.relative(root, file))
  const sourceWithoutPackagedTabIcons = source.replace(packagedTabIconPattern, '')

  assert(
    !localAssetPattern.test(sourceWithoutPackagedTabIcons),
    `local v2 asset reference remains: ${relativePath}`
  )

  for (const url of source.match(cloudAssetPattern) || []) {
    assert(manifestUrls.has(url), `cloud asset is not in manifest: ${url}`)
  }
}

console.log('ui-v2 cloud asset references: ok')
