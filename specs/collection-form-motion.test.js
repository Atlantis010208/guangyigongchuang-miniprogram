const assert = require('assert')
const fs = require('fs')

let definition
global.Page = (pageDefinition) => { definition = pageDefinition }

require('../pages/flows/collection-form/collection-form')

const context = { motionSequence: 0 }
const firstClass = definition.nextMotionClass.call(context)
const secondClass = definition.nextMotionClass.call(context)

assert.strictEqual(firstClass, 'content-enter-a')
assert.strictEqual(secondClass, 'content-enter-b')
assert.notStrictEqual(firstClass, secondClass)

const template = fs.readFileSync('pages/flows/collection-form/collection-form.wxml', 'utf8')
const styles = fs.readFileSync('pages/flows/collection-form/collection-form.wxss', 'utf8')
const rankingStyles = fs.readFileSync('components/ranking-sorter/ranking-sorter.wxss', 'utf8')

assert.match(template, /content-transition \{\{motionClass\}\}/)
assert.match(styles, /animation: content-enter-a 180ms/)
assert.match(styles, /opacity: 0; transform: translateY\(8rpx\)/)
assert.doesNotMatch(rankingStyles, /\.drag-handle\s+view/)

console.log('collection-form motion tests passed')
