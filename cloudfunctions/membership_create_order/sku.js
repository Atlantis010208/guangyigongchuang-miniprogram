/**
 * 会员 SKU 表（云函数硬编码，防止前端篡改价格）
 * 配套文档：specs/membership_center/design.md §3.3
 */
const MEMBERSHIP_SKUS = {
  vip_normal_year: {
    skuId: 'vip_normal_year',
    name: '光乙普通会员（1 年）',
    price: 69, // 单位：元
    durationDays: 365,
    targetLevel: 'normal'
  },
  vip_premium_year: {
    skuId: 'vip_premium_year',
    name: '光乙高级会员（1 年）',
    price: 399,
    durationDays: 365,
    targetLevel: 'premium'
  }
}

module.exports = { MEMBERSHIP_SKUS }
