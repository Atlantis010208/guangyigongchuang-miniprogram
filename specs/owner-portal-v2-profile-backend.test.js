const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'cloudfunctions', 'owner_portal_v2', 'index.js')
const source = fs.readFileSync(sourcePath, 'utf8')

function loadFunction(data, openid = 'openid-1') {
  function makeQuery(collectionName) {
    const query = {
      _collectionName: collectionName,
      _docId: '',
      where() { return query },
      orderBy() { return query },
      limit() { return query },
      doc(id) { query._docId = id; return query },
      async get() {
        const rows = data[collectionName] || []
        if (query._docId) {
          return { data: rows.find(item => item._id === query._docId) || null }
        }
        return { data: rows }
      },
    }
    return query
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext() {
      return { OPENID: openid }
    },
    database: () => ({
      command: {
        or: values => ({ $or: values }),
      },
      collection: name => makeQuery(name),
    }),
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map(fileID => ({
        fileID,
        tempFileURL: 'https://temp.example/' + encodeURIComponent(fileID),
      })),
    }),
  }
  const context = {
    require(name) {
      if (name === 'wx-server-sdk') return cloud
      throw new Error(name)
    },
    exports: {},
    console,
  }
  vm.runInNewContext(source, context, { filename: sourcePath })
  return context.exports.main
}

async function run() {
  const main = loadFunction({
    users: [
      {
        _id: 'user-1',
        _openid: 'openid-1',
        nickname: '真实业主',
        avatarUrl: 'cloud://avatar-file',
        phoneNumber: '13800000000',
      },
    ],
    requests: [],
    lighting_cases: [],
  })

  const profile = await main({ action: 'profile' })
  assert.strictEqual(profile.success, true)
  assert.strictEqual(profile.data.user.nickname, '真实业主')
  assert.strictEqual(profile.data.user.avatarFileID, 'cloud://avatar-file')
  assert.strictEqual(profile.data.user.avatarUrl, 'https://temp.example/cloud%3A%2F%2Favatar-file')
  assert.strictEqual(profile.data.user.phoneNumber, '13800000000')

  const overview = await main({ action: 'overview' })
  assert.strictEqual(overview.success, true)
  assert.strictEqual(overview.data.user.avatarUrl, 'https://temp.example/cloud%3A%2F%2Favatar-file')
  assert.strictEqual(overview.data.user.nickname, '真实业主')

  const anonymous = loadFunction({ users: [] }, '')
  const unauthenticated = await anonymous({ action: 'profile' })
  assert.strictEqual(unauthenticated.success, false)
  assert.strictEqual(unauthenticated.code, 'UNAUTHENTICATED')

  console.log('owner portal v2 profile backend checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
