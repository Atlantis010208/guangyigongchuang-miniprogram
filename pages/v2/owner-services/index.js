const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const TARGET_ROUTE = '/pages/v2/owner-home/index'
const COPY = Object.freeze({
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

function buildTargetUrl(options) {
  const query = Object.keys(options || {})
    .filter((key) => key !== 'tab')
    .map((key) => (
      encodeURIComponent(key) + '=' + encodeURIComponent(String(options[key]))
    ))

  return TARGET_ROUTE + '?tab=services' + (
    query.length ? '&' + query.join('&') : ''
  )
}

Page({
  onLoad(options = {}) {
    wx.redirectTo({
      url: buildTargetUrl(options),
      fail() {
        wx.showToast({
          title: COPY.routeError,
          icon: 'none',
        })
      },
    })
  },
  onShow() {
    enforceV2Gate('owner')
  }
})

