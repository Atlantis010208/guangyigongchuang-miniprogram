'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { PRODUCTION_ENV_ID } = require('../config/cloud-env')

const V2_FUNCTIONS = Object.freeze([
  'ui_release_gate',
  'owner_portal_v2',
  'designer_portal_v2'
])
// 独立测试环境是全新环境，联调要走通完整主流程就得把沿途云函数都带上。
// 刻意排除微信支付链路（wxpayFunctions、deposit_create/confirm/refund、
// refund_apply/cancel、membership_create_order）：这些会真实调起支付或退款，
// 测试环境验证收益低而资金风险不对称，需要时单独评估商户号绑定后再部署。
const TEST_SUPPORT_FUNCTIONS = Object.freeze([
  // 登录链路：缺一个都进不去应用
  'login', 'getPhoneNumber', 'check_designer_whitelist',
  // 用户身份与设置
  'user_operations', 'user_set_identity', 'settings_operations', 'membership_status',
  // 内容浏览
  'lighting_cases_list', 'gallery_list', 'gallery_favorites', 'lighting_reviews_list',
  'lighting_delivery_list', 'lighting_manual_config', 'collection_form_public',
  'virtual_categories', 'products_list', 'product_detail', 'viewer_count',
  // 需求单与预约邀请
  'requests_list', 'requests_create', 'requests_detail', 'requests_update', 'requests_remove',
  'appointments_operations', 'invitations_create', 'invitations_query', 'invitations_operations',
  // 订单（仅增删改查，不含支付动作）
  'orders_list', 'orders_create', 'orders_update', 'orders_remove', 'mall_orders_list',
  'receipts_operations', 'parse_address', 'cart_operations',
  // 押金与退款的只读查询
  'deposit_query', 'refund_detail',
  // 设计师侧
  'designer_projects', 'designer_demands', 'designer_profile', 'designer_portfolios',
  'designers_list', 'designer_detail', 'designer_settings',
  // 课程与测验
  'courses_list', 'course_detail', 'course_videos', 'course_purchase_check',
  'course_progress_update', 'quiz_detail', 'quiz_submit', 'quiz_attempt_get', 'quiz_attempt_list',
  // 工具箱与计算器
  'get_calc_config', 'admin_calc_config', 'calc_history', 'calc_report', 'calc_export_pdf',
  'color_temp_ai', 'toolkit_detail', 'toolkit_purchase_check',
  // 互动
  'favorites_operations', 'feedback_operations',
  // 首次启动时按需建集合
  'initCollections'
])
const ALLOWED_FUNCTIONS = Object.freeze([...V2_FUNCTIONS, ...TEST_SUPPORT_FUNCTIONS])

function readArg(argv, name) {
  const prefix = `--${name}=`
  const inline = argv.find(arg => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : ''
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`) || argv.includes(name)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

function assertZeroGate(file) {
  const gate = readJson(file)
  const safe = gate.enabled === false &&
    gate.ownerEnabled === false &&
    gate.designerEnabled === false &&
    Number(gate.ownerPercent) === 0 &&
    Number(gate.designerPercent) === 0
  if (!safe) throw new Error(`生产部署前灰度配置必须全部关闭且比例为 0%：${file}`)
}

function main(argv = process.argv.slice(2)) {
  const envId = String(readArg(argv, 'env-id') || (argv[0] && !argv[0].startsWith('-') ? argv[0] : '') || '').trim()
  const defaults = hasFlag(argv, 'include-test-support') ? ALLOWED_FUNCTIONS : V2_FUNCTIONS
  const requested = String(readArg(argv, 'functions') || defaults.join(','))
    .split(',').map(value => value.trim()).filter(Boolean)
  const dryRun = hasFlag(argv, 'dry-run')
  const allowProduction = hasFlag(argv, 'allow-production')
  const confirmZeroPercent = hasFlag(argv, 'confirm-zero-percent')
  const root = path.resolve(__dirname, '..')
  const gateConfig = path.resolve(root, readArg(argv, 'gate-config') || 'fixtures/ui-v2-test/ui-release-config.json')

  if (!envId) {
    console.error('缺少 --env-id。联调部署必须显式指定独立测试环境。')
    return 2
  }

  const illegal = requested.filter(name => !ALLOWED_FUNCTIONS.includes(name))
  if (illegal.length) {
    console.error(`阻止部署非 V2 云函数：${illegal.join(', ')}`)
    return 2
  }

  if (envId === PRODUCTION_ENV_ID) {
    const testSupportRequested = requested.filter(name => TEST_SUPPORT_FUNCTIONS.includes(name))
    if (testSupportRequested.length) {
      console.error(`?????????????????????${testSupportRequested.join(', ')}`)
      return 2
    }
    if (!allowProduction || !confirmZeroPercent) {
      console.error('生产部署被阻止。必须同时传入 --allow-production --confirm-zero-percent。')
      return 2
    }
    try {
      assertZeroGate(gateConfig)
    } catch (error) {
      console.error(error.message)
      return 2
    }
  }

  // Windows 上 Node 18.20+ 禁止直接 spawn .cmd，必须经由 shell，且参数需自行加引号
  const isWindows = process.platform === 'win32'
  const tcb = path.join(root, 'node_modules', '.bin', isWindows ? 'tcb.cmd' : 'tcb')
  if (!dryRun && !fs.existsSync(tcb)) {
    console.error(`未找到本地 CloudBase CLI：${tcb}`)
    return 2
  }

  for (const name of requested) {
    const fnDir = path.join(root, 'cloudfunctions', name)
    const args = ['fn', 'deploy', name, '-e', envId, '--dir', fnDir, '--force']
    console.log(`[deploy:v2] ${tcb} ${args.join(' ')}`)
    if (dryRun) continue

    const quote = value => (isWindows && /[\s&|<>^]/.test(value) ? `"${value}"` : value)
    const result = spawnSync(
      isWindows ? quote(tcb) : tcb,
      isWindows ? args.map(quote) : args,
      { cwd: root, encoding: 'utf8', shell: isWindows }
    )
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    const output = `${result.stdout || ''}\n${result.stderr || ''}`
    const cliFailure = /unhandledRejection|ErrorEXError|JSONError|部署失败/i.test(output)
    if (result.error || result.status !== 0 || cliFailure) {
      if (result.error) console.error(result.error.message)
      return result.status || 1
    }
  }

  console.log(`[deploy:v2] 完成，仅处理：${requested.join(', ')}`)
  return 0
}

if (require.main === module) process.exitCode = main()

module.exports = { V2_FUNCTIONS, TEST_SUPPORT_FUNCTIONS, ALLOWED_FUNCTIONS, assertZeroGate, main, readArg, hasFlag }