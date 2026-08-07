'use strict'
const { callCloud } = require('./cloud')
module.exports = {
  overview: () => callCloud('designer_portal_v2', { action: 'overview' }),
  projects: params => callCloud('designer_projects', Object.assign({ action: 'list' }, params || {})),
  demands: params => callCloud('designer_demands', Object.assign({ action: 'list' }, params || {})),
  courses: params => callCloud('courses_list', params || {}),
  profile: () => callCloud('designer_profile', { action: 'get' }),
  portfolios: () => callCloud('designer_portfolios', { action: 'list' })
}
