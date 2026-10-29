'use strict'

const { parseAiJson, normalizeText } = require('./presentation-domain')

const DEFAULT_ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7'
const DEFAULT_PROVIDER = process.env.CASE_PRESENTATION_AI_PROVIDER || 'custom-minimax-m3'
const DEFAULT_MODEL = process.env.CASE_PRESENTATION_AI_MODEL || 'MiniMax-M3'
const DEFAULT_TIMEOUT = Number(process.env.CASE_PRESENTATION_AI_TIMEOUT_MS) || 180000
const DEFAULT_PROMPT_VERSION = process.env.CASE_PRESENTATION_PROMPT_VERSION || 'case-deck-v1'

class AiAdapterError extends Error {
  constructor(code, message, cause) {
    super(message)
    this.name = 'AiAdapterError'
    this.code = code
    this.cause = cause
  }
}

function extractText(response) {
  if (typeof response === 'string') return response
  if (!response || typeof response !== 'object') return ''
  if (typeof response.text === 'string') return response.text
  if (typeof response.content === 'string') return response.content
  if (response.data) {
    const nested = extractText(response.data)
    if (nested) return nested
  }
  const choices = response.choices
  if (Array.isArray(choices) && choices[0]) {
    const message = choices[0].message || choices[0]
    if (typeof message.content === 'string') return message.content
    if (Array.isArray(message.content)) {
      return message.content.map(item => item && (item.text || item.content || '')).join('')
    }
  }
  return ''
}

function withTimeout(promise, timeoutMs) {
  let timer = null
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new AiAdapterError('AI_TIMEOUT', 'AI 服务响应超时')), timeoutMs)
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function createAiAdapter(options = {}) {
  const env = options.env || DEFAULT_ENV_ID
  const provider = options.provider || DEFAULT_PROVIDER
  const modelName = options.model || DEFAULT_MODEL
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT
  const promptVersion = options.promptVersion || DEFAULT_PROMPT_VERSION
  const cloudbase = options.cloudbase || require('@cloudbase/node-sdk')
  const app = options.app || cloudbase.init({ env, timeout: timeoutMs })
  const model = options.modelClient || app.ai().createModel(provider)

  async function generateJson({ messages, temperature = 0.25 }) {
    try {
      const result = await withTimeout(Promise.resolve(model.generateText({
        model: modelName,
        messages,
        temperature
      })), timeoutMs)
      const text = extractText(result)
      if (!normalizeText(text)) throw new AiAdapterError('AI_INVALID_OUTPUT', 'AI 返回为空')
      try {
        return parseAiJson(text)
      } catch (error) {
        throw new AiAdapterError('AI_INVALID_OUTPUT', 'AI 返回了无法解析的 JSON', error)
      }
    } catch (error) {
      if (error instanceof AiAdapterError) throw error
      throw new AiAdapterError('AI_SERVICE_ERROR', error.message || 'AI 服务调用失败', error)
    }
  }

  async function analyzeImageBatch({ caseDoc, images }) {
    const content = [{
      type: 'text',
      text: [
        '你是建筑灯光案例的图片编辑。分析下面每一张图片，只输出 JSON。',
        `项目：${normalizeText(caseDoc.title)}；空间：${normalizeText(caseDoc.spaceType)}；城市：${normalizeText(caseDoc.city)}`, 
        '返回格式：{"images":[{"imageIndex":0,"spaceLabel":"客厅","description":"不超过36字","focal":{"x":0.5,"y":0.5},"recommendedLayout":"space-overlay","dominantColor":"#24221F"}]}。',
        'imageIndex 必须与输入编号一致；focal 为 0 到 1；dominantColor 必须是深色 #RRGGBB；不要 Markdown。'
      ].join('\n')
    }]
    images.forEach(image => {
      content.push({ type: 'text', text: `图片编号 imageIndex=${image.imageIndex}` })
      content.push({ type: 'image_url', image_url: { url: image.url } })
    })
    return generateJson({ messages: [{ role: 'user', content }], temperature: 0.1 })
  }

  async function generateNarrative({ caseDoc, imageAnalyses, spacePageCount }) {
    const analyses = imageAnalyses.map((item, index) => ({
      imageIndex: index,
      spaceLabel: item.spaceLabel,
      description: item.description,
      recommendedLayout: item.recommendedLayout
    }))
    const prompt = [
      '你是高级灯光设计提案的文案编辑。为手机竖屏 PPT 生成克制、专业、可快速扫读的中文文案。只输出 JSON，不要 Markdown。',
      `项目：${normalizeText(caseDoc.title)}`,
      `城市：${normalizeText(caseDoc.city)}`,
      `空间类型：${normalizeText(caseDoc.spaceType)}`,
      `服务：${Array.isArray(caseDoc.services) ? caseDoc.services.join('、') : ''}`,
      `原始说明：${normalizeText(caseDoc.desc)}`,
      `图片分析：${JSON.stringify(analyses)}`,
      `必须生成恰好 ${spacePageCount} 个 spaces。`,
      '返回格式：{"concept":{"title":"不超过18字","body":"不超过70字","imageIndex":1},"strategy":{"title":"不超过16字","imageIndex":2,"items":[{"title":"不超过6字","body":"不超过24字"}]},"spaces":[{"imageIndex":0,"label":"空间短标签","title":"不超过18字","body":"不超过60字","layout":"space-overlay"}]}。',
      'strategy.items 必须 2-3 项；spaces 的 layout 只能是 space-overlay 或 image-top-copy-bottom；文案描述灯光逻辑，不写夸张营销词。'
    ].join('\n')
    return generateJson({ messages: [{ role: 'user', content: prompt }], temperature: 0.35 })
  }

  return {
    analyzeImageBatch,
    generateNarrative,
    meta: { env, provider, model: modelName, timeoutMs, promptVersion }
  }
}

module.exports = {
  createAiAdapter,
  AiAdapterError,
  extractText,
  withTimeout,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_PROMPT_VERSION
}
