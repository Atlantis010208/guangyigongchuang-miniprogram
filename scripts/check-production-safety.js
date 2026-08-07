'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const PROD = 'cloud1-5gb9c5u2c58ad6d7'
const problems = []
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
if (appSource.includes(PROD)) problems.push('app.js contains production environment ID')
const cloudbaserc = JSON.parse(fs.readFileSync(path.join(root, 'cloudbaserc.json'), 'utf8').replace(/^\uFEFF/, ''))
if (cloudbaserc.envId === PROD) problems.push('cloudbaserc.json defaults to production')
const { resolveCloudEnvironment } = require(path.join(root, 'config/cloud-env'))
for (const envVersion of ['develop', 'trial']) {
  const result = resolveCloudEnvironment({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }) }, { testEnvId: '' })
  if (result.ok || result.envId === PROD) problems.push(`${envVersion} unexpectedly resolves to production`)
}
if (problems.length) { problems.forEach(item => console.error(`BLOCKED: ${item}`)); process.exit(1) }
console.log('Production safety scan passed')

