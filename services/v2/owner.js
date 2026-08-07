'use strict'
const { callCloud } = require('./cloud')
module.exports = {
  overview: () => callCloud('owner_portal_v2', { action: 'overview' }),
  cases: (limit = 20) => callCloud('lighting_cases_list', { limit }),
  collectionForms: () => callCloud('collection_form_public', { action: 'listTypes' }),
  categories: () => callCloud('virtual_categories', {}),
  products: params => callCloud('products_list', params || {})
}
