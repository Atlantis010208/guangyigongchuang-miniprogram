'use strict'

// 上线前将字体子集文件上传到当前小程序云存储，并在这里填写 HTTPS 临时/公开地址。
// 留空时页面会立即使用系统宋体/黑体，不阻塞首屏。
module.exports = Object.freeze({
  fontSources: {
    serif: '',
    sans: '',
  },
  controlAutoHideMs: 2600,
})
