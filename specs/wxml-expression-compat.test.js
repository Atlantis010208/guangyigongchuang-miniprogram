const assert = require('assert')
const fs = require('fs')
const path = require('path')

const roots = [
  'pages/flows/collection-form',
  'components/form-question-renderer',
  'components/ranking-sorter',
]

const files = roots.flatMap((root) => fs.readdirSync(root)
  .filter((name) => name.endsWith('.wxml'))
  .map((name) => path.join(root, name)))

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /\{\{[^}]*\([^}]*\)\s*\.[^}]*\}\}/,
    `${file} contains parenthesized property access unsupported by the WXML parser`
  )
}

console.log('WXML expression compatibility tests passed')
