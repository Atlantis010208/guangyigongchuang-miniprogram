const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const http = require('http')
const tls = require('tls')
const { URL } = require('url')

const envId = 'cloud1-5gb9c5u2c58ad6d7'
const endpoint = 'tcb.tencentcloudapi.com'
const region = process.env.CLOUDBASE_TCB_CLOUDAPI_REGION || 'ap-shanghai'
const service = 'tcb'
const version = '2018-06-08'
const authPath = 'C:/Users/imac/.config/.cloudbase/auth.json'

const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')).credential || {}
const credential = {
  secretId: auth.tmpSecretId,
  secretKey: auth.tmpSecretKey,
  token: auth.tmpToken
}

if (!credential.secretId || !credential.secretKey || !credential.token) {
  throw new Error('CloudBase temporary credentials missing')
}

function sha256(message, encoding = 'hex') {
  return crypto.createHash('sha256').update(message).digest(encoding)
}

function hmac(key, message, encoding) {
  return crypto.createHmac('sha256', key).update(message).digest(encoding)
}

function sign(action, payloadObject) {
  const payload = JSON.stringify(payloadObject)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${endpoint}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256(payload)].join('\n')
  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [algorithm, timestamp, credentialScope, sha256(canonicalRequest)].join('\n')
  const signature = hmac(
    hmac(hmac(hmac(`TC3${credential.secretKey}`, date), service), 'tc3_request'),
    stringToSign,
    'hex'
  )

  return {
    payload,
    timestamp,
    authorization: `${algorithm} Credential=${credential.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  }
}

function sendHttps(headers, payload, socket) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: endpoint,
      servername: endpoint,
      method: 'POST',
      path: '/',
      headers,
      agent: false,
      timeout: 90000,
      ...(socket ? { createConnection: () => socket } : {})
    }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let parsed
        try {
          parsed = JSON.parse(data)
        } catch {
          reject(new Error(`Non-JSON ${res.statusCode}: ${data.slice(0, 500)}`))
          return
        }

        if (res.statusCode >= 400 || parsed.Response?.Error) {
          const err = new Error(parsed.Response?.Error?.Message || `HTTP ${res.statusCode}`)
          err.code = parsed.Response?.Error?.Code
          err.requestId = parsed.Response?.RequestId
          reject(err)
          return
        }

        resolve(parsed.Response || parsed)
      })
    })

    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('HTTPS request timeout')))
    req.write(payload)
    req.end()
  })
}

function callTencent(action, payloadObject) {
  return new Promise((resolve, reject) => {
    const { payload, timestamp, authorization } = sign(action, payloadObject)
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      Host: endpoint,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region,
      'X-TC-Token': credential.token,
      Authorization: authorization,
      'Content-Length': Buffer.byteLength(payload)
    }
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy

    if (!proxy) {
      sendHttps(headers, payload).then(resolve, reject)
      return
    }

    const proxyUrl = new URL(proxy)
    const connectReq = http.request({
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port || 80),
      method: 'CONNECT',
      path: `${endpoint}:443`,
      timeout: 45000
    })

    connectReq.on('connect', (res, rawSocket) => {
      if (res.statusCode !== 200) {
        rawSocket.destroy()
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`))
        return
      }

      const tlsSocket = tls.connect({ socket: rawSocket, servername: endpoint }, () => {
        sendHttps(headers, payload, tlsSocket).then(resolve, reject)
      })
      tlsSocket.on('error', reject)
      tlsSocket.setTimeout(90000, () => tlsSocket.destroy(new Error('TLS socket timeout')))
    })

    connectReq.on('error', reject)
    connectReq.on('timeout', () => connectReq.destroy(new Error('Proxy CONNECT timeout')))
    connectReq.end()
  })
}

async function callWithRetry(action, payload, tries = 6) {
  let lastError
  for (let i = 1; i <= tries; i += 1) {
    try {
      return await callTencent(action, payload)
    } catch (err) {
      lastError = err
      console.error(`[${action}] attempt ${i}/${tries} failed: ${err.code || 'ERR'} ${err.message || err}`)
      if (i < tries) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * i))
      }
    }
  }
  throw lastError
}

function isNotFound(err) {
  const text = `${err.code || ''} ${err.message || ''}`.toLowerCase()
  return text.includes('resourcenotfound') || text.includes('not found') || text.includes('not exist')
}

async function upsertFunction(name, zipPath) {
  const zipFile = fs.readFileSync(zipPath).toString('base64')
  const updatePayload = {
    FunctionName: name,
    EnvId: envId,
    Handler: 'index.main',
    InstallDependency: 'TRUE',
    Code: { ZipFile: zipFile }
  }

  try {
    const res = await callWithRetry('UpdateFunctionCode', updatePayload)
    console.log(`${name}: UpdateFunctionCode ok ${res.RequestId || ''}`)
    return
  } catch (err) {
    if (!isNotFound(err)) throw err
    console.log(`${name}: not found, creating`)
  }

  const createPayload = {
    FunctionName: name,
    EnvId: envId,
    Role: 'TCB_QcsRole',
    Stamp: 'MINI_QCBASE',
    Handler: 'index.main',
    InstallDependency: 'TRUE',
    Runtime: 'Nodejs18.15',
    MemorySize: 256,
    Timeout: 10,
    Code: { ZipFile: zipFile }
  }
  const res = await callWithRetry('CreateFunction', createPayload)
  console.log(`${name}: CreateFunction ok ${res.RequestId || ''}`)
}

async function main() {
  const list = await callWithRetry('ListFunctions', { EnvId: envId, Limit: 1, Offset: 0 }, 3)
  console.log(`ListFunctions ok total=${list.TotalCount ?? 'unknown'}`)
  await upsertFunction('toolkit_purchase_check', path.resolve(__dirname, 'toolkit_purchase_check.zip'))
  await upsertFunction('cart_operations', path.resolve(__dirname, 'cart_operations.zip'))
}

main().catch((err) => {
  console.error('DEPLOY_FAILED', err.code || '', err.message || err)
  if (err.requestId) console.error(`requestId=${err.requestId}`)
  process.exit(1)
})
