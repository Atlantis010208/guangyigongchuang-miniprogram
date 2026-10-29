const assert = require('assert')
const path = require('path')

const root = path.resolve(__dirname, '..')
const adminGeography = require(path.join(root, 'cloudfunctions', 'admin_cases', 'country-geography.js'))
const publicGeography = require(path.join(root, 'cloudfunctions', 'lighting_cases_list', 'country-geography.js'))

for (const geography of [adminGeography, publicGeography]) {
  assert.strictEqual(geography.hasValidCoordinates(-33.8688, 151.2093), true)
  assert.strictEqual(geography.coordinatesMatchCountry('AU', -33.8688, 151.2093), true)
  assert.strictEqual(geography.coordinatesMatchCountry('AU', 23.145306, 113.255904), false)
  assert.strictEqual(geography.coordinatesMatchCountry('AU', null, null), false)
}

console.log('case geography contract checks passed')
