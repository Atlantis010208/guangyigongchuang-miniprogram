const assert = require('assert')
const path = require('path')

const {
  createPreviewService,
  hashToken,
  generateUnlimitedCodeByHttp
} = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'preview-service'
))
const fixture = require('./fixtures/case-presentation/three-images.json')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createMocks() {
  const tokens = []
  const caseDoc = {
    ...clone(fixture.case),
    presentation: { draft: { revision: 4 } }
  }
  let qrArgs = null

  const db = {
    collection(name) {
      if (name === 'lighting_cases') {
        return {
          doc() {
            return { async get() { return { data: clone(caseDoc) } } }
          }
        }
      }
      if (name === 'case_presentation_preview_tokens') {
        return {
          async add({ data }) {
            const record = { _id: `token-${tokens.length + 1}`, ...clone(data) }
            tokens.push(record)
            return { _id: record._id }
          },
          where() {
            return { async remove() { return { stats: { removed: 0 } } } }
          },
          doc(id) {
            return {
              async remove() {
                const index = tokens.findIndex(item => item._id === id)
                if (index >= 0) tokens.splice(index, 1)
              }
            }
          }
        }
      }
      throw new Error(`unknown collection ${name}`)
    }
  }

  const cloud = {
    openapi: {
      wxacode: {
        async getUnlimited(args) {
          qrArgs = args
          return { buffer: Buffer.from('png') }
        }
      }
    },
    async uploadFile() { return { fileID: 'cloud://preview/code.png' } },
    async getTempFileURL() {
      return { fileList: [{ fileID: 'cloud://preview/code.png', tempFileURL: 'https://temp.example/code.png' }] }
    }
  }

  return { db, cloud, tokens, getQrArgs: () => qrArgs }
}

async function run() {
  const mocks = createMocks()
  const service = createPreviewService({
    db: mocks.db,
    cloud: mocks.cloud,
    command: { lt: value => ({ $lt: value }) },
    now: () => 1000,
    randomBytes: () => Buffer.alloc(16, 7)
  })

  const result = await service.createPreviewCode({
    caseId: fixture.case._id,
    expectedRevision: 4,
    createdBy: 'admin-1'
  })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.data.previewCodeUrl, 'https://temp.example/code.png')
  assert.strictEqual(result.data.expiresAt, 901000)
  assert.strictEqual(mocks.tokens.length, 1)
  assert.strictEqual(mocks.tokens[0].caseId, fixture.case._id)
  assert.strictEqual(mocks.tokens[0].draftRevision, 4)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(mocks.tokens[0], 'token'), false)
  const qrArgs = mocks.getQrArgs()
  assert(qrArgs.scene.length <= 32)
  assert.strictEqual(mocks.tokens[0].tokenHash, hashToken(qrArgs.scene))
  assert.notStrictEqual(mocks.tokens[0].tokenHash, qrArgs.scene)
  assert.strictEqual(qrArgs.page, 'pages/v2/owner-case-presentation/index')

  const conflict = await service.createPreviewCode({
    caseId: fixture.case._id,
    expectedRevision: 3,
    createdBy: 'admin-1'
  })
  assert.strictEqual(conflict.code, 'DRAFT_CONFLICT')
  assert.strictEqual(mocks.tokens.length, 1)

  const fallbackMocks = createMocks()
  let fallbackCalls = 0
  fallbackMocks.cloud.openapi.wxacode.getUnlimited = async () => {
    const error = new Error('wxacode.getUnlimited:fail invalid wx openapi access_token')
    error.code = 'INVALID_WX_ACCESS_TOKEN'
    throw error
  }
  const fallbackService = createPreviewService({
    db: fallbackMocks.db,
    cloud: fallbackMocks.cloud,
    command: { lt: value => ({ $lt: value }) },
    now: () => 2000,
    randomBytes: () => Buffer.alloc(16, 8),
    wxAppId: 'wx-test-appid',
    wxAppSecret: 'test-secret',
    async generateCodeByHttp(args) {
      fallbackCalls += 1
      assert.strictEqual(args.appId, 'wx-test-appid')
      assert.strictEqual(args.appSecret, 'test-secret')
      assert.strictEqual(args.page, 'pages/v2/owner-case-presentation/index')
      return Buffer.from('png-from-http')
    }
  })
  const fallback = await fallbackService.createPreviewCode({
    caseId: fixture.case._id,
    expectedRevision: 4,
    createdBy: 'admin-1'
  })
  assert.strictEqual(fallback.ok, true)
  assert.strictEqual(fallbackCalls, 1)
  assert.strictEqual(fallbackMocks.tokens.length, 1)

  const httpCalls = []
  const httpBuffer = await generateUnlimitedCodeByHttp({
    appId: 'wx-test-appid',
    appSecret: 'test-secret',
    scene: 'scene-1',
    page: 'pages/v2/owner-case-presentation/index',
    width: 430,
    checkPath: false,
    envVersion: 'release',
    async request(args) {
      httpCalls.push(args)
      if (httpCalls.length === 1) {
        return {
          buffer: Buffer.from(JSON.stringify({ access_token: 'token-1', expires_in: 7200 })),
          contentType: 'application/json'
        }
      }
      return { buffer: Buffer.from('png-binary'), contentType: 'image/png' }
    }
  })
  assert.strictEqual(httpBuffer.toString(), 'png-binary')
  assert.strictEqual(httpCalls.length, 2)
  assert.strictEqual(httpCalls[1].body.check_path, false)
  assert.strictEqual(httpCalls[1].body.env_version, 'release')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(httpCalls[1].body, 'checkPath'), false)

  console.log('case presentation preview service tests passed')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
