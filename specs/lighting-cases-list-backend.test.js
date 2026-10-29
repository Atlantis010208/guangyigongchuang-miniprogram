const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const crypto = require('crypto')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'cloudfunctions', 'lighting_cases_list', 'index.js')
const source = fs.readFileSync(sourcePath, 'utf8')

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadFunction(items) {
  const query = {
    _docId: '',
    where() { return query },
    orderBy() { return query },
    limit() { return query },
    doc(id) { query._docId = id; return query },
    async get() {
      if (query._docId) {
        const item = items.find(row => row._id === query._docId)
        return { data: item || null }
      }
      return { data: items }
    },
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => ({
      command: { and: conditions => ({ $and: conditions }) },
      collection: () => query,
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
      if (name === 'crypto') return crypto
      if (name === './country-geography') {
        return require(path.join(root, 'cloudfunctions', 'lighting_cases_list', 'country-geography.js'))
      }
      throw new Error(name)
    },
    exports: {},
    console,
  }
  vm.runInNewContext(source, context, { filename: sourcePath })
  return context.exports.main
}

async function run() {
  const main = loadFunction([
    { _id: 'home-1', status: 'active', title: '\u5357\u4eac\u79c1\u5b85\u706f\u5149', spaceType: '\u4f4f\u5b85\u7a7a\u95f4', imageFileIds: ['cloud://home'] },
    { _id: 'shop-1', status: 'active', title: '\u5546\u4e1a\u5c55\u5385\u7167\u660e', spaceType: '\u5546\u4e1a\u7a7a\u95f4', imageFileIds: ['cloud://shop'] },
    { _id: 'hotel-1', status: 'active', title: '\u5ea6\u5047\u9152\u5e97\u706f\u5149', category: 'hotel', imageFileIds: ['cloud://hotel'] },
  ])

  const list = await main({ limit: 10 })
  assert.strictEqual(list.success, true)
  assert.deepStrictEqual(
    plain(list.data.items.map(item => [item._id, item.category, item.spaceType, item.spaceTypeLabel])),
    [
      ['home-1', 'residential', '\u4f4f\u5b85\u7a7a\u95f4', '\u4f4f\u5b85'],
      ['shop-1', 'commercial', '\u5546\u4e1a\u7a7a\u95f4', '\u5546\u4e1a'],
      ['hotel-1', 'hotel', '\u9152\u5e97\u7a7a\u95f4', '\u9152\u5e97'],
    ]
  )
  assert.strictEqual(list.data.items[0].imageUrls[0], 'https://temp.example/cloud%3A%2F%2Fhome')
  assert.deepStrictEqual(
    plain(list.data.spaceTypes.map(item => [item.value, item.label, item.count])),
    [
      ['\u4f4f\u5b85\u7a7a\u95f4', '\u4f4f\u5b85', 1],
      ['\u5546\u4e1a\u7a7a\u95f4', '\u5546\u4e1a', 1],
      ['\u9152\u5e97\u7a7a\u95f4', '\u9152\u5e97', 1],
    ]
  )

  const filtered = await main({ limit: 10, spaceType: '\u9152\u5e97\u7a7a\u95f4' })
  assert.strictEqual(filtered.success, true)
  assert.deepStrictEqual(plain(filtered.data.items.map(item => item._id)), ['hotel-1'])

  const legacyFiltered = await main({ limit: 10, category: 'residential' })
  assert.strictEqual(legacyFiltered.success, true)
  assert.deepStrictEqual(plain(legacyFiltered.data.items.map(item => item._id)), ['home-1'])

  const detail = await main({ action: 'detail', id: 'shop-1' })
  assert.strictEqual(detail.success, true)
  assert.strictEqual(detail.data.item.category, 'commercial')
  assert.strictEqual(detail.data.item.spaceType, '\u5546\u4e1a\u7a7a\u95f4')
  assert.strictEqual(detail.data.item.presentationAvailable, false)

  const websiteMain = loadFunction([
    {
      _id: 'sydney-valid',
      status: 'active',
      websiteVisible: true,
      title: '澳洲·悉尼别墅-Putney',
      desc: 'Sydney project',
      countryCode: 'AU',
      city: '悉尼',
      cityEn: 'Sydney',
      lat: -33.8688,
      lng: 151.2093,
      imageFileIds: ['cloud://sydney-valid'],
    },
    {
      _id: 'sydney-guangzhou',
      status: 'active',
      websiteVisible: true,
      title: '错误悉尼坐标',
      desc: 'Wrong country coordinates',
      countryCode: 'AU',
      city: '悉尼',
      lat: 23.145306,
      lng: 113.255904,
      imageFileIds: ['cloud://sydney-invalid'],
    },
    {
      _id: 'sydney-missing',
      status: 'active',
      websiteVisible: true,
      title: '缺少悉尼坐标',
      desc: 'Missing coordinates',
      countryCode: 'AU',
      city: '悉尼',
      imageFileIds: ['cloud://sydney-missing'],
    },
  ])
  const website = await websiteMain({ channel: 'website', limit: 10 })
  assert.strictEqual(website.success, true)
  assert.deepStrictEqual(plain(website.data.items.map(item => item.id)), ['sydney-valid'])
  assert.deepStrictEqual(
    plain(website.data.items.map(item => [item.lat, item.lng])),
    [[-33.8688, 151.2093]]
  )

  console.log('lighting cases list backend checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
