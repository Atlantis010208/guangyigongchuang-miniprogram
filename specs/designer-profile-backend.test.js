const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')

function loadCloudFunction(relativePath, fixture = {}) {
  const sourcePath = path.join(root, relativePath)
  const source = fs.readFileSync(sourcePath, 'utf8')
  const stats = { designersGet: 0, portfoliosGet: 0, addDesigner: 0 }
  const command = {
    or: (conditions) => ({ operator: 'or', conditions }),
    in: (values) => ({ operator: 'in', values }),
    neq: (value) => ({ operator: 'neq', value }),
    inc: (value) => ({ operator: 'inc', value }),
  }

  function collection(name) {
    const query = {
      _docId: '',
      where() { return query },
      limit() { return query },
      orderBy() { return query },
      skip() { return query },
      field() { return query },
      doc(id) { query._docId = id; return query },
      add: async ({ data }) => {
        if (name === 'designers') stats.addDesigner += 1
        return { _id: `${name}-new`, data }
      },
      update: async () => ({ stats: { updated: 1 } }),
      count: async () => {
        if (name === 'designer_portfolios') {
          return { total: fixture.portfolios ? fixture.portfolios.length : 0 }
        }
        return { total: 0 }
      },
      get: async () => {
        if (name === 'users') {
          return { data: fixture.userMissing ? [] : [{ _id: 'user-1', _openid: 'openid-1', phone: '13212345644', nickname: 'Atlantis', roles: fixture.roles === undefined ? 2 : fixture.roles }] }
        }
        if (name === 'designer_whitelist') {
          return { data: fixture.whitelistActive === false ? [] : [{ _id: 'white-1', status: 'active', phone: '13212345644', name: 'Atlantis', designerId: fixture.designerId || 'designer-1' }] }
        }
        if (name === 'designers') {
          stats.designersGet += 1
          const designer = fixture.designer === undefined
            ? { _id: 'designer-1', name: 'Atlantis', title: '专业灯光设计', avatar: 'cloud://avatar', bio: '后台维护简介', portfolioImages: fixture.portfolioImages || [] }
            : fixture.designer
          if (!designer) return query._docId ? { data: null } : { data: [] }
          return query._docId ? { data: designer } : { data: [designer] }
        }
        if (name === 'designer_portfolios') {
          stats.portfoliosGet += 1
          return { data: fixture.portfolios || [] }
        }
        return query._docId ? { data: null } : { data: [] }
      },
    }
    return query
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext: () => ({ OPENID: 'openid-1' }),
    database: () => ({ command, collection }),
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({ fileID, tempFileURL: `https://temp.example/${encodeURIComponent(fileID)}` }))
    })
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
  return { main: context.exports.main, stats, source }
}

async function run() {
  const profile = loadCloudFunction('cloudfunctions/designer_profile/index.js')
  const profileResult = await profile.main({ action: 'get' })
  assert.strictEqual(profileResult.success, true)
  assert.strictEqual(profileResult.data.name, 'Atlantis')
  assert.strictEqual(profileResult.data.certified, true)
  assert.strictEqual(profileResult.data.tempAvatarUrl, 'https://temp.example/cloud%3A%2F%2Favatar')

  const uncertifiedProfile = loadCloudFunction('cloudfunctions/designer_profile/index.js', { whitelistActive: false })
  const uncertifiedProfileResult = await uncertifiedProfile.main({ action: 'get' })
  assert.strictEqual(uncertifiedProfileResult.success, true)
  assert.strictEqual(uncertifiedProfileResult.data.certified, false)
  assert.strictEqual(uncertifiedProfile.stats.designersGet > 0, true, 'uncertified selected designer can still load profile')

  const ownerProfile = loadCloudFunction('cloudfunctions/designer_profile/index.js', { roles: 1 })
  const ownerProfileResult = await ownerProfile.main({ action: 'get' })
  assert.strictEqual(ownerProfileResult.success, false)
  assert.strictEqual(ownerProfileResult.code, 'NOT_DESIGNER')

  const portfolioFunction = loadCloudFunction('cloudfunctions/designer_portfolios/index.js', {
    portfolios: [{ _id: 'p1', designerId: 'designer-1', title: '真实作品', coverImage: 'cloud://cover-1', galleryImages: ['cloud://cover-1'] }]
  })
  const portfolioResult = await portfolioFunction.main({ action: 'list', page: 1, pageSize: 3 })
  assert.strictEqual(portfolioResult.success, true)
  assert.strictEqual(portfolioResult.data.list.length, 1)
  assert.strictEqual(portfolioResult.data.list[0].title, '真实作品')
  assert.strictEqual(portfolioResult.data.list[0].tempCoverImage, 'https://temp.example/cloud%3A%2F%2Fcover-1')

  const adminImageFallback = loadCloudFunction('cloudfunctions/designer_portfolios/index.js', {
    portfolioImages: ['cloud://admin-image'],
    portfolios: []
  })
  const adminImageResult = await adminImageFallback.main({ action: 'list', page: 1, pageSize: 3 })
  assert.strictEqual(adminImageResult.data.list.length, 1)
  assert.strictEqual(adminImageResult.data.list[0].source, 'designers.portfolioImages')

  const emptyPortfolios = loadCloudFunction('cloudfunctions/designer_portfolios/index.js', {
    portfolioImages: [],
    portfolios: []
  })
  const emptyResult = await emptyPortfolios.main({ action: 'list', page: 1, pageSize: 3 })
  assert.strictEqual(emptyResult.success, true)
  assert.strictEqual(emptyResult.data.list.length, 0, 'empty backend data must remain empty instead of mock fallback')

  for (const source of [profile.source, portfolioFunction.source]) {
    assert(source.includes("db.collection('designer_whitelist')"))
    assert(source.includes("status: 'active'"))
    assert(!source.includes('project-residential-card.webp'))
    assert(!source.includes('portfolio-bedroom.png'))
  }

  console.log('designer profile backend contract: ok')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
