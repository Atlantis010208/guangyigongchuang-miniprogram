const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')

function loadCloudFunction(relativePath, fixture) {
  const sourcePath = path.join(root, relativePath)
  const source = fs.readFileSync(sourcePath, 'utf8')
  const requestStats = { count: 0, get: 0 }
  const command = {
    or: conditions => ({ operator: 'or', conditions }),
    in: values => ({ operator: 'in', values }),
    neq: value => ({ operator: 'neq', value }),
    exists: value => ({ operator: 'exists', value }),
    nin: values => ({ operator: 'nin', values }),
    inc: value => ({ operator: 'inc', value }),
  }

  function collection(name) {
    const query = {
      where() { return query },
      limit() { return query },
      orderBy() { return query },
      field() { return query },
      skip() { return query },
      doc() { return query },
      update: async () => ({ stats: { updated: 1 } }),
      count: async () => {
        if (name === 'requests') requestStats.count += 1
        return { total: 0 }
      },
      get: async () => {
        if (name === 'users') return { data: [{ _id: 'user-1', _openid: 'openid-1', phone: '13212345644', roles: 2 }] }
        if (name === 'designer_whitelist') {
          return { data: fixture.whitelistStatus === 'active' ? [{ _id: 'white-1', status: 'active', phone: '13212345644' }] : [] }
        }
        if (name === 'designers') return { data: fixture.hasDesigner === false ? [] : [{ _id: 'designer-1', openid: 'openid-1' }] }
        if (name === 'requests') {
          requestStats.get += 1
          return { data: [] }
        }
        return { data: [] }
      },
    }
    return query
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext: () => ({ OPENID: 'openid-1' }),
    database: () => ({ command, collection }),
  }
  const context = {
    require(name) {
      if (name === 'wx-server-sdk') return cloud
      throw new Error('Unexpected require: ' + name)
    },
    exports: {},
    console,
  }
  vm.runInNewContext(source, context, { filename: sourcePath })
  return { main: context.exports.main, requestStats, source }
}

async function run() {
  const activeProjects = loadCloudFunction('cloudfunctions/designer_projects/index.js', { whitelistStatus: 'active' })
  const accessResult = await activeProjects.main({ action: 'access' })
  assert.strictEqual(accessResult.success, true)
  assert.strictEqual(accessResult.data.allowed, true)
  assert.strictEqual(accessResult.data.designerId, 'designer-1')

  for (const whitelistStatus of ['missing', 'disabled']) {
    const projects = loadCloudFunction('cloudfunctions/designer_projects/index.js', { whitelistStatus })
    const result = await projects.main({ action: 'list' })
    assert.strictEqual(result.code, 'DESIGNER_NOT_CERTIFIED')
    assert.strictEqual(projects.requestStats.count, 0, 'blocked project request must stop before project query')
  }

  const missingProfile = loadCloudFunction('cloudfunctions/designer_projects/index.js', { whitelistStatus: 'active', hasDesigner: false })
  const missingProfileResult = await missingProfile.main({ action: 'access' })
  assert.strictEqual(missingProfileResult.code, 'NOT_DESIGNER_PROFILE')

  const activeDemands = loadCloudFunction('cloudfunctions/designer_demands/index.js', { whitelistStatus: 'active' })
  const countResult = await activeDemands.main({ action: 'count' })
  assert.strictEqual(countResult.success, true)
  assert.strictEqual(activeDemands.requestStats.count, 1)

  const blockedDemands = loadCloudFunction('cloudfunctions/designer_demands/index.js', { whitelistStatus: 'disabled' })
  const blockedCountResult = await blockedDemands.main({ action: 'count' })
  assert.strictEqual(blockedCountResult.code, 'DESIGNER_NOT_CERTIFIED')
  assert.strictEqual(blockedDemands.requestStats.count, 0, 'blocked marketplace count must stop before request query')

  for (const source of [activeProjects.source, activeDemands.source]) {
    assert(source.includes("db.collection('designer_whitelist')"))
    assert(source.includes("status: 'active'"))
    assert(source.includes('verifyDesignerWhitelistAccess(openid)'))
  }
  console.log('designer project whitelist backend gate: ok')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
