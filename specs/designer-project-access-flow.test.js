const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'pages', 'v2', 'designer-projects', 'index.js')
const pageSource = fs.readFileSync(pagePath, 'utf8')
const serviceSource = fs.readFileSync(path.join(root, 'services', 'v2', 'designer.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(root, 'pages', 'v2', 'designer-projects', 'index.wxml'), 'utf8')

function createRuntime(designerApi) {
  let definition
  const context = {
    require(request) {
      if (request.includes('navigation-gate')) return { enforceV2Gate: async () => true }
      if (request.includes('services/v2/designer')) return designerApi
      throw new Error('Unexpected require: ' + request)
    },
    Page(pageDefinition) {
      definition = pageDefinition
    },
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 20 }),
      getMenuButtonBoundingClientRect: () => ({ top: 26, height: 32 }),
      navigateTo() {},
      switchTab() {},
      redirectTo() {},
      showToast() {},
      showModal() {},
    },
  }
  vm.runInNewContext(pageSource, context, { filename: pagePath })
  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) {
    Object.assign(this.data, update)
  }
  return page
}

async function run() {
  let deniedProjectCalls = 0
  let deniedDemandCalls = 0
  const deniedPage = createRuntime({
    projectAccess: async () => ({
      ok: false,
      code: 'DESIGNER_NOT_CERTIFIED',
      message: '当前账号尚未通过设计师认证',
    }),
    projects: async () => { deniedProjectCalls += 1; return { ok: true, data: { list: [] } } },
    demands: async () => { deniedDemandCalls += 1; return { ok: true, data: { list: [] } } },
  })

  const denied = await deniedPage.checkProjectAccess()
  assert.strictEqual(denied, false)
  assert.strictEqual(deniedPage.data.projectAccessStatus, 'denied')
  assert.strictEqual(deniedPage.data.projectAccessMessage, deniedPage.data.copy.accessDeniedMessage)
  assert.strictEqual(deniedProjectCalls, 0, 'denied access must not load project data')
  assert.strictEqual(deniedDemandCalls, 0, 'denied access must not load marketplace data')

  let allowedProjectCalls = 0
  let allowedDemandCalls = 0
  const allowedPage = createRuntime({
    projectAccess: async () => ({ ok: true, data: { allowed: true } }),
    projects: async () => { allowedProjectCalls += 1; return { ok: true, data: { list: [] } } },
    demands: async () => { allowedDemandCalls += 1; return { ok: true, data: { list: [] } } },
  })

  const allowed = await allowedPage.checkProjectAccess()
  assert.strictEqual(allowed, true)
  assert.strictEqual(allowedPage.data.projectAccessStatus, 'allowed')
  assert.strictEqual(allowedProjectCalls, 2, 'allowed access must load ongoing and completed projects')
  assert.strictEqual(allowedDemandCalls, 1, 'allowed access must load marketplace demands')

  assert(serviceSource.includes("projectAccess: () => callCloud('designer_projects', { action: 'access' })"))
  assert(pageWxml.includes('bindtap="retryProjectAccess"'))
  assert(pageWxml.includes('bindtap="showCertificationGuide"'))
  assert(pageWxml.includes('project-access-state__icon-surface'))
  assert(pageWxml.includes("projectAccessStatus === 'checking'"))
  console.log('designer project access flow: ok')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
