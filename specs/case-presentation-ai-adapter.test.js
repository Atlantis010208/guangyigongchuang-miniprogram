const assert = require('assert')
const path = require('path')

const {
  createAiAdapter,
  AiAdapterError,
  extractText,
  withTimeout,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL
} = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'ai-adapter'
))

async function run() {
  assert.strictEqual(DEFAULT_PROVIDER, 'custom-minimax-m3')
  assert.strictEqual(DEFAULT_MODEL, 'MiniMax-M3')
  assert.strictEqual(extractText({ choices: [{ message: { content: '{"ok":true}' } }] }), '{"ok":true}')
  assert.strictEqual(extractText({ data: { text: 'nested' } }), 'nested')

  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 5),
    error => error instanceof AiAdapterError && error.code === 'AI_TIMEOUT'
  )

  let initOptions = null
  const initModelClient = {
    async generateText() {
      return { text: '{"images":[]}' }
    }
  }
  createAiAdapter({
    env: 'test-env',
    timeoutMs: 150000,
    cloudbase: {
      init(options) {
        initOptions = options
        return { ai: () => ({ createModel: () => initModelClient }) }
      }
    }
  })
  assert.deepStrictEqual(initOptions, { env: 'test-env', timeout: 150000 })

  const modelClient = {
    async generateText() {
      return { choices: [{ message: { content: '```json\n{"images":[]}\n```' } }] }
    }
  }
  const adapter = createAiAdapter({
    app: { ai: () => ({ createModel: () => modelClient }) },
    cloudbase: {},
    modelClient,
    model: 'mock',
    timeoutMs: 100
  })
  const parsed = await adapter.analyzeImageBatch({
    caseDoc: { title: '测试案例' },
    images: [{ imageIndex: 0, url: 'https://example.com/image.jpg' }]
  })
  assert.deepStrictEqual(parsed, { images: [] })

  const reasoningAdapter = createAiAdapter({
    app: { ai: () => ({ createModel: () => ({}) }) },
    cloudbase: {},
    modelClient: {
      async generateText() {
        return { text: '<think>先检查字段。</think>\n{"concept":{"title":"光的秩序"}}' }
      }
    },
    timeoutMs: 100
  })
  const reasoningParsed = await reasoningAdapter.generateNarrative({
    caseDoc: {}, imageAnalyses: [], spacePageCount: 1
  })
  assert.deepStrictEqual(reasoningParsed, { concept: { title: '光的秩序' } })

  const invalidAdapter = createAiAdapter({
    app: { ai: () => ({ createModel: () => ({}) }) },
    cloudbase: {},
    modelClient: { async generateText() { return { text: 'not-json' } } },
    timeoutMs: 100
  })
  await assert.rejects(
    () => invalidAdapter.generateNarrative({ caseDoc: {}, imageAnalyses: [], spacePageCount: 1 }),
    error => error instanceof AiAdapterError && error.code === 'AI_INVALID_OUTPUT'
  )

  console.log('case presentation AI adapter tests passed')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
