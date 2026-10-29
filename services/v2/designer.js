'use strict'
const { callCloud, callCloudRaw } = require('./cloud')
module.exports = {
  overview: () => callCloud('designer_portal_v2', { action: 'overview' }),
  projectAccess: () => callCloud('designer_projects', { action: 'access' }),
  projects: params => callCloud('designer_projects', Object.assign({ action: 'list' }, params || {})),
  demands: params => callCloud('designer_demands', Object.assign({ action: 'list' }, params || {})),
  courses: params => callCloud('courses_list', params || {}),
  learningIntroduction: courseId => callCloud('designer_learning_content', { action: 'introduction', courseId }),
  learningCatalog: courseId => callCloud('designer_learning_content', { action: 'catalog', courseId }),
  learningHistory: courseId => callCloud('designer_learning_content', { action: 'history', courseId }),
  profile: () => callCloud('designer_profile', { action: 'get' }),
  portfolios: () => callCloud('designer_portfolios', { action: 'list' }),
  login: profile => callCloudRaw('login', { profile: profile || {} }),
  getPhoneNumber: code => callCloudRaw('getPhoneNumber', { code }),
  setIdentity: role => callCloudRaw('user_set_identity', { role }),
  activate: () => callCloudRaw('check_designer_whitelist', { revalidate: true })
}
