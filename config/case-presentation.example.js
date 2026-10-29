'use strict'

module.exports = Object.freeze({
  // 使用已加入小程序 downloadFile 合法域名的 HTTPS Cloud Storage/CDN 地址。
  // 建议只包含本功能需要字符的 woff2 子集，降低首屏后的异步下载体积。
  fontSources: {
    serif: 'https://your-static-domain.example/fonts/noto-serif-sc-case-deck-subset.woff2',
    sans: 'https://your-static-domain.example/fonts/noto-sans-sc-case-deck-subset.woff2',
  },
  controlAutoHideMs: 2600,
})
