'use strict'
const ROLE_TABS = Object.freeze({
  owner: Object.freeze([
    { slot: 1, text: '首页', url: '/pages/v2/owner-home/index' },
    { slot: 2, text: '案例', url: '/pages/v2/owner-cases/index' },
    { slot: 3, text: '服务', url: '/pages/v2/owner-services/index' },
    { slot: 4, text: '工具', url: '/pages/v2/owner-tools/index' },
    { slot: 5, text: '我的', url: '/pages/profile/home/home' }
  ]),
  designer: Object.freeze([
    { slot: 1, text: '学习', url: '/pages/v2/designer-learning/index' },
    { slot: 2, text: '工具', url: '/pages/v2/designer-tools/index' },
    { slot: 3, text: '项目', url: '/pages/v2/designer-projects/index' },
    { slot: 4, text: '我的', url: '/pages/v2/designer-profile/index' }
  ])
})
function getRoleTabs(role) { return ROLE_TABS[role] || [] }
module.exports = { ROLE_TABS, getRoleTabs }
