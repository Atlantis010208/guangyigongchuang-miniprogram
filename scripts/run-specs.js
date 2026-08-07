'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const specs = fs.readdirSync(path.join(root, 'specs')).filter(name => name.endsWith('.test.js')).sort()
const settle = () => new Promise(resolve => setTimeout(resolve, 10))
async function main() {
  let failed = 0
  for (const name of specs) {
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(root + path.sep) && !key.endsWith(path.join('scripts', 'run-specs.js'))) delete require.cache[key]
    }
    for (const key of ['Page', 'Component', 'App', 'wx', 'getApp', 'getCurrentPages']) delete global[key]
    let asyncError = null
    const onUnhandled = error => { asyncError = error }
    process.once('unhandledRejection', onUnhandled)
    try {
      require(path.join(root, 'specs', name))
      await settle()
      if (asyncError) throw asyncError
      console.log(`PASS ${name}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${name}`)
      console.error(error && error.stack || error)
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
    }
  }
  if (failed) process.exitCode = 1
  else console.log(`\n${specs.length} specs passed`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
