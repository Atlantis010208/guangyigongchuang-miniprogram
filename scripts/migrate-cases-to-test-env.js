'use strict'

/**
 * 把生产环境的落地案例（lighting_cases）搬到独立测试环境，供 UI V2 联调使用。
 *
 * 为什么不能直接复制数据：案例封面存的是云存储 fileID，环境 ID 焊死在里面
 * （cloud://<envId>.<bucket>/path），照搬到测试环境取不到图。因此必须把图片
 * 下载下来重新上传到目标环境，再用新 fileID 改写文档。
 *
 * 流程：读生产案例 → 下载封面图 → 上传到目标环境 → 生成新 fileID → 产出待导入 JSON。
 * 脚本只从生产读、只往测试写，最后一步不直接写库，而是产出 JSON 供人工确认后导入。
 *
 * 用法：node scripts/migrate-cases-to-test-env.js --target-env <测试环境ID> [--dry-run]
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { spawnSync } = require('child_process')
const { PRODUCTION_ENV_ID } = require('../config/cloud-env')

const ROOT = path.resolve(__dirname, '..')
const WORK_DIR = path.join(ROOT, 'tmp', 'case-migration')
const IS_WINDOWS = process.platform === 'win32'
const TCB = path.join(ROOT, 'node_modules', '.bin', IS_WINDOWS ? 'tcb.cmd' : 'tcb')

function readArg(argv, name) {
  const prefix = `--${name}=`
  const inline = argv.find(arg => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : ''
}

// Windows 上 Node 18.20+ 禁止直接 spawn .cmd，必须经由 shell，参数需自行加引号
function runTcb(args) {
  const quote = value => (IS_WINDOWS && /[\s&|<>^{}"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value)
  const result = spawnSync(
    IS_WINDOWS ? quote(TCB) : TCB,
    IS_WINDOWS ? args.map(quote) : args,
    { cwd: ROOT, encoding: 'utf8', shell: IS_WINDOWS, maxBuffer: 32 * 1024 * 1024 }
  )
  return `${result.stdout || ''}\n${result.stderr || ''}`
}

/** 从 tcb fn invoke 的人类可读输出里抠出 JSON 返回值 */
function parseInvokeResult(output) {
  const marker = output.indexOf('Return result：')
  if (marker < 0) throw new Error('未在 CLI 输出中找到返回结果，可能是调用失败')
  const tail = output.slice(marker + 'Return result：'.length)
  const end = tail.indexOf('\nInvocation log')
  const payload = (end >= 0 ? tail.slice(0, end) : tail).trim()
  return JSON.parse(payload)
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`下载失败 HTTP ${response.statusCode}: ${url}`))
        return
      }
      const file = fs.createWriteStream(destination)
      response.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    }).on('error', reject)
  })
}

async function main(argv = process.argv.slice(2)) {
  const targetEnv = String(readArg(argv, 'target-env') || '').trim()
  const dryRun = argv.includes('--dry-run')

  if (!targetEnv) {
    console.error('缺少 --target-env。必须显式指定目标测试环境 ID。')
    return 2
  }
  // 这个脚本的方向是单向的：生产只读、测试可写。写回生产一律拒绝。
  if (targetEnv === PRODUCTION_ENV_ID) {
    console.error('拒绝以生产环境为目标：本脚本只允许把生产数据搬到测试环境。')
    return 2
  }

  fs.mkdirSync(WORK_DIR, { recursive: true })

  console.log(`[1/4] 从生产环境读取案例列表 ${PRODUCTION_ENV_ID}`)
  const invokeOutput = runTcb(['fn', 'invoke', 'lighting_cases_list', '-e', PRODUCTION_ENV_ID, '--params', '{"limit":50}'])
  const response = parseInvokeResult(invokeOutput)
  if (!response.success) throw new Error(`读取案例失败：${response.errorMessage || response.code}`)
  const items = (response.data && response.data.items) || []
  console.log(`      读到 ${items.length} 条案例`)

  console.log('[2/4] 下载封面图')
  const downloads = []
  for (const item of items) {
    const urls = Array.isArray(item.imageUrls) ? item.imageUrls : []
    const fileIds = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
    for (let i = 0; i < urls.length; i += 1) {
      // 复用生产的 cloudPath 尾段做文件名，迁移前后路径保持一致便于比对
      const cloudPath = String(fileIds[i] || '').split('/').slice(3).join('/') || `lighting-cases/${Date.now()}_${i}.jpg`
      const local = path.join(WORK_DIR, path.basename(cloudPath))
      downloads.push({ url: urls[i], cloudPath, local, caseId: item._id, index: i })
    }
  }
  for (const task of downloads) {
    if (fs.existsSync(task.local) && fs.statSync(task.local).size > 0) continue
    if (dryRun) { console.log(`      [dry-run] 下载 ${task.cloudPath}`); continue }
    await download(task.url, task.local)
    console.log(`      ${task.cloudPath} (${fs.statSync(task.local).size} B)`)
  }

  console.log(`[3/4] 上传到测试环境 ${targetEnv}`)
  for (const task of downloads) {
    if (dryRun) { console.log(`      [dry-run] 上传 ${task.cloudPath}`); continue }
    const output = runTcb(['storage', 'upload', task.local, task.cloudPath, '-e', targetEnv])
    if (/失败|Error|error:/i.test(output) && !/成功|success/i.test(output)) {
      throw new Error(`上传失败 ${task.cloudPath}\n${output}`)
    }
    console.log(`      ${task.cloudPath}`)
  }

  console.log('[4/4] 生成待导入文档')
  // fileID 结构固定为 cloud://<envId>.<bucket>/<cloudPath>，bucket 由 CLI 上传结果决定，
  // 这里按目标环境的既有命名规律推导，导入前会打印出来供核对。
  const bucket = String(readArg(argv, 'bucket') || `6775-${targetEnv}-1378684587`)
  const now = Date.now()
  const documents = items.map(item => {
    const own = downloads.filter(task => task.caseId === item._id)
    const imageFileIds = own.map(task => `cloud://${targetEnv}.${bucket}/${task.cloudPath}`)
    return {
      _id: item._id,
      imageFileIds,
      title: item.title || '',
      services: item.services || [],
      desc: item.desc || '',
      officialAccountUrl: item.officialAccountUrl || '',
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  })

  const outFile = path.join(WORK_DIR, 'lighting-cases.json')
  fs.writeFileSync(outFile, JSON.stringify(documents, null, 2), 'utf8')
  console.log(`      已写出 ${documents.length} 条到 ${path.relative(ROOT, outFile)}`)
  console.log(`      fileID 前缀：cloud://${targetEnv}.${bucket}/`)
  return 0
}

if (require.main === module) {
  main().then(code => { process.exitCode = code }).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { main, parseInvokeResult }
