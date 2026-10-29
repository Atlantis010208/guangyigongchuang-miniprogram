'use strict'

// 与管理端 case-countries.ts 同源：195 个主权国家/观察员国，外加常用地区。
const COUNTRY_CODES = `
AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW PS HK MO TW XK
`.trim().split(/\s+/)

const REGION_CODE_SETS = {
  europe: new Set(`AL AD AM AT AZ BY BE BA BG HR CZ DK EE FI FR GE DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA XK`.split(' ')),
  'middle-east': new Set(`BH CY EG IR IQ IL JO KW LB OM PS QA SA SY TR AE YE`.split(' ')),
  'north-america': new Set(`CA US`.split(' ')),
  'latin-america': new Set(`AG AR BS BB BZ BO BR CL CO CR CU DM DO EC SV GD GT GY HT HN JM MX NI PA PY PE KN LC VC SR TT UY VE`.split(' ')),
  africa: new Set(`DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW`.split(' '))
}

const zhNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
const enNames = new Intl.DisplayNames(['en'], { type: 'region' })

function getRegion(countryCode) {
  if (countryCode === 'CN') return 'china'
  for (const [region, codes] of Object.entries(REGION_CODE_SETS)) {
    if (codes.has(countryCode)) return region
  }
  return 'asia-pacific'
}

const COUNTRY_OPTIONS = Object.freeze(Object.fromEntries(COUNTRY_CODES.map(countryCode => [
  countryCode,
  Object.freeze({
    countryCode,
    countryZh: zhNames.of(countryCode) || countryCode,
    countryEn: enNames.of(countryCode) || countryCode,
    region: getRegion(countryCode),
    scope: countryCode === 'CN' ? 'china' : 'international'
  })
])))

module.exports = { COUNTRY_OPTIONS }
