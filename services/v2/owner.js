'use strict'
const { callCloud } = require('./cloud')
module.exports = {
  overview: () => callCloud('owner_portal_v2', { action: 'overview' }),
  profile: () => callCloud('owner_portal_v2', { action: 'profile' }),
  cases: (params = {}) => {
    const data = typeof params === 'number' ? { limit: params } : (params || {})
    return callCloud('lighting_cases_list', data)
  },
  caseDetail: id => callCloud('lighting_cases_list', { action: 'detail', id }),
  casePresentation: id => callCloud('lighting_cases_list', { action: 'presentation', id }, 12000),
  casePresentationPreview: token => callCloud('lighting_cases_list', { action: 'presentationPreview', token }, 12000),
  collectionForms: () => callCloud('collection_form_public', { action: 'listTypes' }),
  categories: () => callCloud('virtual_categories', {}),
  products: params => callCloud('products_list', params || {})
}
