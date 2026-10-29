const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const homeRoot = path.join(root, 'pages', 'v2', 'owner-home')
const casesRoot = path.join(root, 'pages', 'v2', 'owner-cases')
const casesContentRoot = path.join(casesRoot, 'content')

const homeJs = fs.readFileSync(path.join(homeRoot, 'index.js'), 'utf8')
const homeWxml = fs.readFileSync(path.join(homeRoot, 'index.wxml'), 'utf8')
const casesContentJs = fs.readFileSync(
  path.join(casesContentRoot, 'index.js'),
  'utf8'
)
const casesContentWxml = fs.readFileSync(
  path.join(casesContentRoot, 'index.wxml'),
  'utf8'
)

const failures = []

function test(name, assertion) {
  try {
    assertion()
    console.log('ok - ' + name)
  } catch (error) {
    failures.push({ name, error })
    console.error('not ok - ' + name)
    console.error('  ' + error.message)
  }
}

function createPageRuntime(source, filename) {
  let definition
  const navigationCalls = []
  const setDataUpdates = []

  const context = {
    Page(pageDefinition) {
      definition = pageDefinition
    },
    getCurrentPages() {
      return []
    },
    wx: {
      getWindowInfo() {
        return {
          windowWidth: 375,
          windowHeight: 667,
          screenHeight: 667,
          statusBarHeight: 20,
          safeArea: { bottom: 667 },
        }
      },
      getMenuButtonBoundingClientRect() {
        return { top: 26, height: 32 }
      },
      redirectTo(options) {
        navigationCalls.push({ api: 'redirectTo', url: options.url })
      },
      navigateTo(options) {
        navigationCalls.push({ api: 'navigateTo', url: options.url })
      },
      navigateBack(options) {
        navigationCalls.push({ api: 'navigateBack', delta: options.delta })
      },
      pageScrollTo() {},
      showToast() {},
      switchTab() {},
    },
  }

  vm.runInNewContext(source, context, { filename })
  assert(definition, filename + ' must register a Page definition')

  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) {
    setDataUpdates.push(update)
    Object.assign(this.data, update)
  }

  return {
    definition,
    navigationCalls,
    page,
    setDataUpdates,
  }
}

function createComponentRuntime(source, filename) {
  let definition
  const setDataUpdates = []

  const context = {
    Component(componentDefinition) {
      definition = componentDefinition
    },
    wx: {
      getWindowInfo() {
        return {
          windowWidth: 375,
          windowHeight: 667,
          screenHeight: 667,
          statusBarHeight: 20,
          safeArea: { bottom: 667 },
        }
      },
      getMenuButtonBoundingClientRect() {
        return { top: 26, height: 32 }
      },
      navigateTo() {},
      showToast() {},
    },
  }

  vm.runInNewContext(source, context, { filename })
  assert(definition, filename + ' must register a Component definition')

  const component = Object.assign({}, definition.methods)
  component.data = Object.assign({}, definition.data)
  component.setData = function setData(update) {
    setDataUpdates.push(update)
    Object.assign(this.data, update)
  }

  if (definition.lifetimes && definition.lifetimes.created) {
    definition.lifetimes.created.call(component)
  }

  return {
    component,
    definition,
    setDataUpdates,
  }
}

function findPanelTag(wxml, panelName) {
  const pattern = new RegExp(
    '<view\\b(?=[^>]*\\bdata-preview-panel="' + panelName + '")[^>]*>',
    'i'
  )
  return wxml.match(pattern)
}

test('owner tab switches to cases without creating a new page', () => {
  const runtime = createPageRuntime(
    homeJs,
    path.join(homeRoot, 'index.js')
  )
  runtime.page.onLoad()

  const stateBeforeSwitch = JSON.stringify(runtime.page.data)
  runtime.navigationCalls.length = 0
  runtime.setDataUpdates.length = 0

  assert.strictEqual(
    typeof runtime.page.switchToCases,
    'function',
    'the owner page must expose its cases-tab interaction'
  )
  runtime.page.switchToCases()

  const pageCreatingCalls = runtime.navigationCalls.filter(
    (call) => call.api === 'redirectTo' || call.api === 'navigateTo'
  )
  const problems = []

  if (pageCreatingCalls.length > 0) {
    problems.push(
      'cases tab created a page via ' + pageCreatingCalls.map((call) => call.api).join(', ')
    )
  }
  if (JSON.stringify(runtime.page.data) === stateBeforeSwitch) {
    problems.push('cases tab did not switch the resident panel state')
  }

  assert.deepStrictEqual(problems, [])
})

test('owner tab switches to tools without creating a new page', () => {
  const runtime = createPageRuntime(
    homeJs,
    path.join(homeRoot, 'index.js')
  )
  runtime.page.onLoad()
  runtime.navigationCalls.length = 0

  assert.strictEqual(typeof runtime.page.switchToTools, 'function')
  runtime.page.switchToTools()

  assert.strictEqual(runtime.page.data.activePreviewTab, 'tools')
  assert.deepStrictEqual(runtime.navigationCalls, [])
})

test('owner tab switches to services without creating a new page', () => {
  const runtime = createPageRuntime(
    homeJs,
    path.join(homeRoot, 'index.js')
  )
  runtime.page.onLoad()
  runtime.navigationCalls.length = 0

  assert.strictEqual(typeof runtime.page.switchToServices, 'function')
  runtime.page.switchToServices()

  assert.strictEqual(runtime.page.data.activePreviewTab, 'services')
  assert.deepStrictEqual(runtime.navigationCalls, [])
})

test('owner preview keeps home, cases, services and tools mounted behind one tab bar', () => {
  const homePanelTag = findPanelTag(homeWxml, 'home')
  const casesPanelTag = findPanelTag(homeWxml, 'cases')
  const servicesPanelTag = findPanelTag(homeWxml, 'services')
  const toolsPanelTag = findPanelTag(homeWxml, 'tools')
  const tabBars = homeWxml.match(
    /<view\b(?=[^>]*\bclass="[^"]*\bpreview-tabbar\b[^"]*")[^>]*>/g
  ) || []
  const problems = []

  if (!homePanelTag) problems.push('missing data-preview-panel="home"')
  if (!casesPanelTag) problems.push('missing data-preview-panel="cases"')
  if (!servicesPanelTag) problems.push('missing data-preview-panel="services"')
  if (!toolsPanelTag) problems.push('missing data-preview-panel="tools"')

  for (const match of [homePanelTag, casesPanelTag, servicesPanelTag, toolsPanelTag]) {
    if (match && /\bwx:(?:if|elif)\s*=/.test(match[0])) {
      problems.push('preview panels must stay mounted instead of using wx:if/wx:elif')
    }
  }

  if (tabBars.length !== 1) {
    problems.push('expected exactly one preview-tabbar, found ' + tabBars.length)
  }

  assert.deepStrictEqual(problems, [])
})

test('inactive resident tab content is gated to prevent native input bleed-through', () => {
  const problems = []

  for (const panelName of ['cases', 'services', 'tools']) {
    const pattern = new RegExp(
      '<scroll-view\\b(?=[^>]*\\bwx:if="{{activePreviewTab === \'' + panelName + '\'}}")(?=[^>]*\\bclass="preview-panel__scroller")[^>]*>',
      'i'
    )
    if (!pattern.test(homeWxml)) {
      problems.push(panelName + ' panel content must be rendered only when active')
    }
  }

  assert.deepStrictEqual(problems, [])
})

test('case component exposes search and category interactions', () => {
  const problems = []

  if (!casesContentWxml.includes('bindinput="handleSearch"')) {
    problems.push('case component is missing its search interaction')
  }
  if (!casesContentWxml.includes('bindtap="selectCategory"')) {
    problems.push('case component is missing its category interaction')
  }

  assert.deepStrictEqual(problems, [])
})

test('case component starts empty and hydrates from backend after attached', () => {
  const runtime = createComponentRuntime(
    casesContentJs,
    path.join(casesContentRoot, 'index.js')
  )
  const initialData = runtime.definition.data
  const problems = []

  if (!Array.isArray(initialData.categories) || initialData.categories.length !== 4) {
    problems.push('initial categories must contain all four filters')
  }
  if (!Array.isArray(initialData.cases) || initialData.cases.length !== 0) {
    problems.push('initial cases must be empty before backend hydration')
  }

  assert(
    runtime.definition.lifetimes
      && typeof runtime.definition.lifetimes.attached === 'function',
    'case component must expose its attached lifecycle'
  )
  runtime.definition.lifetimes.attached.call(runtime.component)


  assert.deepStrictEqual(problems, [])
})

if (failures.length > 0) {
  console.error('\n' + failures.length + ' preview lifecycle regression test(s) failed')
  process.exitCode = 1
} else {
  console.log('preview navigation lifecycle: ok')
}
