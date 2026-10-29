'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(
  path.join(root, 'cloudfunctions', 'admin_cases', 'index.js'),
  'utf8'
)

assert.match(
  source,
  /Array\.isArray\(ids\)\s*&&\s*ids\.length\s*>=\s*1\s*&&\s*ids\.every/,
  '案例图片应只校验至少一张和字符串内容'
)
assert.doesNotMatch(
  source,
  /ids\.length\s*<=\s*9/,
  '案例图片不应再限制最多 9 张'
)
assert.doesNotMatch(
  source,
  /imageFileIds 必须为 1-9 张/,
  '接口错误提示不应继续声明 9 张上限'
)

console.log('admin cases image count contract passed')
