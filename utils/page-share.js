// Navigation titles are generated from page JSON; no subpackage code is loaded here.
const titles = require('../config/page-navigation-titles')

function cleanTitle(value) {
  return typeof value === 'string'
    ? value.replace(/光乙共创平台|光乙共创|光乙/g, '').replace(/^[\s·|｜—-]+|[\s·|｜—-]+$/g, '').trim()
    : ''
}

function getShareTitle(page) {
  const data = page.data || {}
  const route = page.route || ''
  let customTitle = ''
  if (route === 'pages/v2/owner-home/index') {
    const tab = data.activePreviewTab || 'home'
    const component = tab !== 'home' && typeof page.selectComponent === 'function'
      ? page.selectComponent('owner-' + tab + '-content') : null
    customTitle = component && component.data && component.data.copy && component.data.copy.title
    customTitle = customTitle || { home: '首页', cases: '案例', services: '选择适合你的灯光服务', tools: '工具' }[tab]
  }
  if (route === 'pages/lighting-manual/index') customTitle = data.heroInfo && data.heroInfo.docTitle
  if (route === 'pages/v2/owner-case-detail/index') customTitle = data.copy && data.copy.navTitle
  if (/^pages\/v2\/designer-(projects|profile|learning|tools)\/index$/.test(route)) customTitle = data.copy && data.copy.title
  if (route === 'pages/v2/designer-workbench/index') customTitle = data.copy && data.copy.workbenchTitle
  return cleanTitle(customTitle) || cleanTitle(page._shareNavigationTitle) || cleanTitle(titles[route]) || '首页'
}

function buildSharePath(page) {
  if (!page || !page.route) return '/pages/products/products'
  const options = Object.assign({}, page.options)
  if (page.route === 'pages/v2/owner-home/index' && page.data && page.data.activePreviewTab) {
    options.tab = page.data.activePreviewTab
  }
  const query = Object.keys(options)
    .filter(key => options[key] !== undefined && options[key] !== null && options[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`)
    .join('&')
  return '/' + page.route + (query ? '?' + query : '')
}

function wrapPageShare(options) {
  const originalShare = options.onShareAppMessage
  options.onShareAppMessage = function() {
    const config = originalShare ? originalShare.apply(this, arguments) : { path: buildSharePath(this) }
    const result = Object.assign({}, config, { title: getShareTitle(this) })
    // Async share metadata must follow the same rule as the immediate fallback.
    if (result.promise && typeof result.promise.then === 'function') {
      result.promise = result.promise.then(value => Object.assign({}, value, { title: getShareTitle(this) }))
    }
    return result
  }
  if (options.onShareTimeline) {
    const originalTimeline = options.onShareTimeline
    options.onShareTimeline = function() {
      return Object.assign({}, originalTimeline.apply(this, arguments), { title: getShareTitle(this) })
    }
  }
  return options
}

function trackNavigationTitles(wxApi, currentPages) {
  const original = wxApi.setNavigationBarTitle
  if (typeof original !== 'function') return
  wxApi.setNavigationBarTitle = function(options) {
    const pages = currentPages()
    const page = pages[pages.length - 1]
    const previous = page && page._shareNavigationTitle
    if (page) page._shareNavigationTitle = options.title
    return original.call(wxApi, Object.assign({}, options, {
      fail(error) {
        if (page && page._shareNavigationTitle === options.title) page._shareNavigationTitle = previous
        if (typeof options.fail === 'function') options.fail(error)
      }
    }))
  }
}

module.exports = { getShareTitle, buildSharePath, wrapPageShare, trackNavigationTitles }
