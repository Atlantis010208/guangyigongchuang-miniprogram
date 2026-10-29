const assert = require('assert')
const path = require('path')

const { createPresentationGenerator, PresentationGenerationError } = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-generator'
))
const domain = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-domain'
))

function fixture(name) {
  return require(path.join(__dirname, 'fixtures', 'case-presentation', `${name}.json`))
}

function createAi(options = {}) {
  return {
    meta: { model: 'mock-vision', promptVersion: 'test-v1' },
    async analyzeImageBatch({ images }) {
      if (options.analysisError) throw Object.assign(new Error('vision failed'), { code: 'AI_SERVICE_ERROR' })
      return {
        images: images.map(item => ({
          imageIndex: item.imageIndex,
          spaceLabel: `空间${item.imageIndex + 1}`,
          description: '光线与材质形成安静层次',
          focal: { x: 0.4 + item.imageIndex * 0.02, y: 0.45 },
          recommendedLayout: item.imageIndex % 2 ? 'image-top-copy-bottom' : 'space-overlay',
          dominantColor: '#24221F'
        }))
      }
    },
    async generateNarrative({ spacePageCount }) {
      if (options.invalidNarrative) return { concept: null, spaces: [] }
      const requestedSpaceCount = options.shortNarrative ? 2 : spacePageCount
      return {
        concept: { title: '让光先建立空间秩序', body: '以克制的明暗关系回应材料、尺度与日常使用。', imageIndex: 1 },
        strategy: {
          title: '三层照明策略',
          imageIndex: 2,
          items: [
            { title: '基础光', body: '柔和控制整体亮度' },
            { title: '重点光', body: '强调材质与艺术焦点' },
            { title: '氛围光', body: '保留夜间舒适层次' }
          ]
        },
        spaces: Array.from({ length: requestedSpaceCount }, (_, index) => ({
          imageIndex: index + 3,
          label: `SPACE ${index + 1}`,
          title: `空间叙事 ${index + 1}`,
          body: '亮度沿着使用路径自然展开，让视线保持从容。',
          layout: index % 2 ? 'image-top-copy-bottom' : 'space-overlay'
        }))
      }
    }
  }
}

function tempUrls(fileIds) {
  return new Map(fileIds.map(fileId => [fileId, `https://temp.example/${encodeURIComponent(fileId)}`]))
}

async function verifyFixture(name, expectedSlides) {
  const data = fixture(name)
  const generator = createPresentationGenerator({
    aiAdapter: createAi(),
    getTempUrls: async fileIds => tempUrls(fileIds),
    now: () => 100
  })
  const result = await generator.generateDraft(data.case)
  assert.strictEqual(result.draft.slides.length, expectedSlides)
  assert.strictEqual(result.draft.slides[0].type, 'cover')
  assert.strictEqual(result.draft.slides.at(-1).type, 'closing')
  assert.strictEqual(result.draft.slides.find(slide => slide.type === 'strategy').layout, 'strategy-image70')
  assert.deepStrictEqual(domain.validateDraft(result.draft, data.case), [])
  const workImages = result.draft.slides
    .filter(slide => !['cover', 'closing'].includes(slide.type))
    .map(slide => slide.imageFileIds[0])
  assert.strictEqual(new Set(workImages).size, workImages.length)
  const cover = result.draft.slides[0]
  const closing = result.draft.slides.at(-1)
  assert.strictEqual(cover.imageFileIds[0], closing.imageFileIds[0])
  assert.notDeepStrictEqual(cover.imageFocals[cover.imageFileIds[0]], closing.imageFocals[closing.imageFileIds[0]])
}

async function verifyImageBatchesRunConcurrently() {
  const data = fixture('nine-images')
  let activeBatches = 0
  let maxActiveBatches = 0
  const ai = createAi()
  const originalAnalyzeImageBatch = ai.analyzeImageBatch
  ai.analyzeImageBatch = async input => {
    activeBatches += 1
    maxActiveBatches = Math.max(maxActiveBatches, activeBatches)
    await new Promise(resolve => setTimeout(resolve, 20))
    try {
      return await originalAnalyzeImageBatch(input)
    } finally {
      activeBatches -= 1
    }
  }
  const generator = createPresentationGenerator({
    aiAdapter: ai,
    getTempUrls: async fileIds => tempUrls(fileIds)
  })

  await generator.generateDraft(data.case)
  assert.strictEqual(maxActiveBatches, 3, '9 张图片的 3 个分析批次应并行执行')
}

async function run() {
  await verifyFixture('three-images', 5)
  await verifyFixture('five-images', 7)
  await verifyFixture('nine-images', 10)
  await verifyImageBatchesRunConcurrently()

  const shortData = fixture('nine-images')
  const shortGenerator = createPresentationGenerator({
    aiAdapter: createAi({ shortNarrative: true }),
    getTempUrls: async fileIds => tempUrls(fileIds)
  })
  const shortResult = await shortGenerator.generateDraft(shortData.case)
  assert.strictEqual(shortResult.draft.slides.length, 10)
  assert(shortResult.warnings.some(item => item.includes('自动补全 4 幕')))

  const data = fixture('three-images')
  const invalidGenerator = createPresentationGenerator({
    aiAdapter: createAi({ invalidNarrative: true }),
    getTempUrls: async fileIds => tempUrls(fileIds)
  })
  await assert.rejects(() => invalidGenerator.generateDraft(data.case), error => {
    assert(error instanceof PresentationGenerationError)
    assert.strictEqual(error.code, 'AI_INVALID_OUTPUT')
    return true
  })

  const noImages = createPresentationGenerator({
    aiAdapter: createAi(),
    getTempUrls: async () => new Map()
  })
  await assert.rejects(() => noImages.generateDraft(data.case), error => error.code === 'IMAGE_URL_ERROR')

  console.log('case presentation generator tests passed')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
