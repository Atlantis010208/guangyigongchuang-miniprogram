'use strict'

const crypto = require('crypto')
const https = require('https')
const { normalizeText } = require('./presentation-domain')
const { extractDoc, serviceError, serviceSuccess } = require('./presentation-service')

const CASE_COLLECTION = 'lighting_cases'
const TOKEN_COLLECTION = 'case_presentation_preview_tokens'
const DEFAULT_TTL_MS = 15 * 60 * 1000
const PREVIEW_PAGE = 'pages/v2/owner-case-presentation/index'

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex')
}

function createSceneToken(randomBytes = crypto.randomBytes) {
  return `p_${randomBytes(16).toString('base64url')}`
}

function safePathSegment(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'case'
}

function extractCodeBuffer(result) {
  if (!result) return null
  if (Buffer.isBuffer(result)) return result
  if (Buffer.isBuffer(result.buffer)) return result.buffer
  if (result.data && Buffer.isBuffer(result.data.buffer)) return result.data.buffer
  if (result.data && Buffer.isBuffer(result.data)) return result.data
  return null
}

function isInvalidWxAccessTokenError(error) {
  const text = [
    error && error.code,
    error && error.errCode,
    error && error.message,
    error && error.errMsg
  ].filter(Boolean).join(' ').toLowerCase()
  return text.includes('invalid_wx_access_token') ||
    text.includes('invalid wx openapi access_token') ||
    text.includes('wxacode.getunlimited:fail invalid') ||
    text.includes('-501001')
}

function requestBuffer({ method = 'GET', url, body, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const request = https.request(url, {
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      } : undefined
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const buffer = Buffer.concat(chunks)
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`微信接口请求失败（HTTP ${response.statusCode}）`))
          return
        }
        resolve({ buffer, contentType: String(response.headers['content-type'] || '') })
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('微信接口请求超时')))
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

function parseWechatJson(buffer, fallbackMessage) {
  let result
  try {
    result = JSON.parse(buffer.toString('utf8'))
  } catch (error) {
    throw new Error(fallbackMessage)
  }
  if (result && result.errcode !== undefined && Number(result.errcode) !== 0) {
    const apiError = new Error(result.errmsg || fallbackMessage)
    apiError.code = result.errcode
    throw apiError
  }
  return result
}

async function generateUnlimitedCodeByHttp({
  appId,
  appSecret,
  scene,
  page,
  width,
  checkPath,
  envVersion,
  request = requestBuffer
}) {
  const tokenUrl = 'https://api.weixin.qq.com/cgi-bin/token?' + [
    'grant_type=client_credential',
    `appid=${encodeURIComponent(appId)}`,
    `secret=${encodeURIComponent(appSecret)}`
  ].join('&')
  const tokenResponse = await request({ method: 'GET', url: tokenUrl })
  const tokenResult = parseWechatJson(tokenResponse.buffer, '微信 access_token 获取失败')
  if (!tokenResult.access_token) throw new Error('微信 access_token 获取失败')

  const codeResponse = await request({
    method: 'POST',
    url: `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(tokenResult.access_token)}`,
    body: {
      scene,
      page,
      width,
      check_path: checkPath,
      env_version: envVersion
    }
  })
  const looksLikeJson = codeResponse.contentType.includes('json') || codeResponse.buffer[0] === 0x7b
  if (looksLikeJson) parseWechatJson(codeResponse.buffer, '小程序码生成失败')
  if (!codeResponse.buffer.length) throw new Error('小程序码接口未返回图片数据')
  return codeResponse.buffer
}

function createPreviewService({
  db,
  command,
  cloud,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  randomBytes = crypto.randomBytes,
  wxAppId = process.env.WX_APPID,
  wxAppSecret = process.env.WX_APPSECRET,
  generateCodeByHttp = generateUnlimitedCodeByHttp
}) {
  async function readCase(caseId) {
    try {
      const result = await db.collection(CASE_COLLECTION).doc(caseId).get()
      return extractDoc(result)
    } catch (error) {
      return null
    }
  }

  async function cleanupExpired(timestamp) {
    if (!command || typeof command.lt !== 'function') return
    try {
      await db.collection(TOKEN_COLLECTION).where({ expiresAt: command.lt(timestamp) }).remove()
    } catch (error) {
      console.warn('[case_presentation_preview] cleanup failed:', error.message)
    }
  }

  async function removeToken(tokenId) {
    if (!tokenId) return
    try {
      await db.collection(TOKEN_COLLECTION).doc(tokenId).remove()
    } catch (error) {
      console.warn('[case_presentation_preview] token rollback failed:', error.message)
    }
  }

  async function createPreviewCode({ caseId, expectedRevision, createdBy }) {
    const id = normalizeText(caseId)
    if (!id) return serviceError('INVALID_PARAMS', '缺少 caseId')
    const caseDoc = await readCase(id)
    if (!caseDoc) return serviceError('CASE_NOT_FOUND', '案例不存在')

    const draft = caseDoc.presentation && caseDoc.presentation.draft
    if (!draft) return serviceError('DRAFT_REQUIRED', '请先生成演示草稿')
    const revision = Number(draft.revision) || 0
    if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== revision) {
      return serviceError('DRAFT_CONFLICT', '草稿已经变化，请重新加载', {
        expectedRevision: Number(expectedRevision),
        currentRevision: revision
      })
    }

    const timestamp = now()
    const expiresAt = timestamp + ttlMs
    const scene = createSceneToken(randomBytes)
    if (scene.length > 32) return serviceError('PREVIEW_CODE_ERROR', '预览凭证长度超限')
    const tokenRecord = {
      tokenHash: hashToken(scene),
      caseId: id,
      draftRevision: revision,
      createdBy: normalizeText(createdBy),
      createdAt: timestamp,
      expiresAt
    }

    cleanupExpired(timestamp)
    const added = await db.collection(TOKEN_COLLECTION).add({ data: tokenRecord })
    const tokenId = added && added._id

    try {
      const codeArgs = {
        scene,
        page: PREVIEW_PAGE,
        width: 430,
        checkPath: false,
        envVersion: 'release'
      }
      let buffer
      try {
        const codeResult = await cloud.openapi.wxacode.getUnlimited(codeArgs)
        buffer = extractCodeBuffer(codeResult)
      } catch (error) {
        if (!isInvalidWxAccessTokenError(error)) throw error
        if (!wxAppId || !wxAppSecret) {
          throw new Error('真机预览需要为 admin_case_presentation 配置 WX_APPID 和 WX_APPSECRET')
        }
        buffer = await generateCodeByHttp({
          appId: wxAppId,
          appSecret: wxAppSecret,
          ...codeArgs
        })
      }
      if (!buffer) throw new Error('小程序码接口未返回图片数据')

      const cloudPath = [
        'case-presentation-preview',
        safePathSegment(id),
        `${revision}-${timestamp}.png`
      ].join('/')
      const uploaded = await cloud.uploadFile({ cloudPath, fileContent: buffer })
      const fileId = uploaded && (uploaded.fileID || uploaded.fileId)
      if (!fileId) throw new Error('小程序码上传失败')
      const temp = await cloud.getTempFileURL({ fileList: [fileId] })
      const item = temp && temp.fileList && temp.fileList[0]
      const previewCodeUrl = item && (item.tempFileURL || item.download_url || item.downloadUrl)
      if (!previewCodeUrl) throw new Error('小程序码临时地址获取失败')

      return serviceSuccess({ previewCodeUrl, expiresAt, draftRevision: revision }, '预览码已生成')
    } catch (error) {
      await removeToken(tokenId)
      return serviceError('PREVIEW_CODE_ERROR', error.message || '小程序码生成失败')
    }
  }

  return { createPreviewCode, cleanupExpired }
}

module.exports = {
  CASE_COLLECTION,
  TOKEN_COLLECTION,
  DEFAULT_TTL_MS,
  PREVIEW_PAGE,
  hashToken,
  createSceneToken,
  safePathSegment,
  extractCodeBuffer,
  isInvalidWxAccessTokenError,
  generateUnlimitedCodeByHttp,
  createPreviewService
}
