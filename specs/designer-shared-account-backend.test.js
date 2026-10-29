const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

const login = read('cloudfunctions/login/index.js')
assert(login.includes('{ alternateOpenids: openid }'))
assert(login.includes('if (unionId) identityConditions.push({ unionId })'))
assert(login.includes('updateData.alternateOpenids = alternateOpenids'))

const phone = read('cloudfunctions/getPhoneNumber/index.js')
assert(phone.includes('const openid = ctx.OPENID || ctx.openid ||'))
assert(phone.includes('findUserByIdentity(db, _, openid)'))
assert(phone.includes('activateDesignerWhitelist('))
assert(phone.includes("availableRoles: ['owner', 'designer']"))
assert(!phone.includes('userIdFromEvent'))
assert(!phone.includes('event.userId'))

const whitelistCheck = read('cloudfunctions/check_designer_whitelist/index.js')
assert(whitelistCheck.includes('user.phoneNumber || user.phone ||'))
assert(whitelistCheck.includes('手机号只能来自微信身份对应的 users 记录'))
assert(whitelistCheck.includes("designerCertified: true"))
assert(whitelistCheck.includes("availableRoles: ['owner', 'designer']"))
assert(!whitelistCheck.includes('const { phone'))

const profile = read('cloudfunctions/designer_profile/index.js')
assert(profile.includes('async function linkDesignerIdentity'))
assert(profile.includes('await linkDesignerIdentity(openid, user, whitelist, designer)'))
assert(profile.includes('async function getSharedAccount'))
assert(profile.includes('profileComplete: Boolean(user.nickname && avatar && phoneNumber)'))
assert(profile.includes('account\n'))

const portfolios = read('cloudfunctions/designer_portfolios/index.js')
assert(portfolios.includes('{ alternateOpenids: openid }'))
assert(portfolios.includes("{ status: 'active', userId: user._id }"))

const adminList = read('cloudfunctions/admin_designer_whitelist_list/index.js')
assert(adminList.includes("bindingStatus: item.designerId && item.userId ? 'linked' : 'pending'"))
assert(adminList.includes('activatedAtDisplay: formatTime(item.activatedAt)'))

const adminImport = read('cloudfunctions/admin_designer_whitelist_import/index.js')
assert(adminImport.includes('reactivatedRecords'))
assert(adminImport.includes("status: 'active'"))
assert(adminImport.includes('reactivatedCount'))

const adminRemove = read('cloudfunctions/admin_designer_whitelist_remove/index.js')
assert(adminRemove.includes('async function revokeLinkedUser'))
assert(adminRemove.includes("availableRoles: ['owner']"))
assert(adminRemove.includes('designerId: _.remove()'))
assert(adminRemove.includes('revokedUserCount'))

const service = read('services/v2/designer.js')
assert(service.includes("activate: () => callCloudRaw('check_designer_whitelist'"))
assert(service.includes("setIdentity: role => callCloudRaw('user_set_identity'"))

const page = read('pages/v2/designer-profile/index.js')
assert(page.includes('function getSharedAccount(response)'))
assert(page.includes('loginNickname: account && account.nickname'))
assert(page.includes('const identityResponse = await designerApi.setIdentity(2)'))
assert(page.includes("wx.setStorageSync('userDoc', user)"))

console.log('designer shared account backend contract: ok')
