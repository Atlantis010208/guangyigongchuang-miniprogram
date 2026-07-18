const PHONE_RULES = {
  '86': { pattern: /^1[3-9]\d{9}$/, name: '中国大陆' },
  '1': { pattern: /^[2-9]\d{9}$/, name: '美国/加拿大' },
  '852': { pattern: /^[569]\d{7}$/, name: '中国香港' },
  '853': { pattern: /^6\d{7}$/, name: '中国澳门' },
  '886': { pattern: /^9\d{8}$/, name: '中国台湾' },
  '81': { pattern: /^[789]0\d{8,9}$/, name: '日本' },
  '82': { pattern: /^1[0-9]\d{7,8}$/, name: '韩国' },
  '65': { pattern: /^[89]\d{7}$/, name: '新加坡' },
  '60': { pattern: /^1\d{8,9}$/, name: '马来西亚' },
  '66': { pattern: /^[689]\d{8}$/, name: '泰国' },
  '84': { pattern: /^\d{9,10}$/, name: '越南' },
  '62': { pattern: /^8\d{8,11}$/, name: '印度尼西亚' },
  '63': { pattern: /^9\d{9}$/, name: '菲律宾' },
  '61': { pattern: /^4\d{8}$/, name: '澳大利亚' },
  '64': { pattern: /^2\d{7,8}$/, name: '新西兰' },
  '971': { pattern: /^5\d{8}$/, name: '阿联酋' }
}

function cleanPhone(phone) {
  if (!phone) return ''
  return String(phone).trim().replace(/[\s\-()]/g, '')
}

function parsePhoneNumber(phone) {
  const raw = cleanPhone(phone)
  if (!raw) return { countryCode: '', purePhone: '', fullPhone: '' }

  const hasPlus = raw.startsWith('+')
  const phoneStr = hasPlus ? raw.substring(1) : raw
  const countryCodes = Object.keys(PHONE_RULES).sort((a, b) => b.length - a.length)

  if (!hasPlus && PHONE_RULES['86'].pattern.test(phoneStr)) {
    return { countryCode: '86', purePhone: phoneStr, fullPhone: `+86${phoneStr}` }
  }

  for (const code of countryCodes) {
    if (!phoneStr.startsWith(code)) continue
    const purePhone = phoneStr.substring(code.length)
    if (!purePhone) continue
    return { countryCode: code, purePhone, fullPhone: `+${code}${purePhone}` }
  }

  return { countryCode: '', purePhone: phoneStr, fullPhone: phoneStr }
}

function validatePhone(phone) {
  const parsed = parsePhoneNumber(phone)
  if (!parsed.countryCode || !parsed.purePhone) {
    return { valid: false, ...parsed, region: '' }
  }

  const rule = PHONE_RULES[parsed.countryCode]
  if (!rule) {
    return { valid: false, ...parsed, region: '未知地区' }
  }

  return {
    valid: rule.pattern.test(parsed.purePhone),
    countryCode: parsed.countryCode,
    purePhone: parsed.purePhone,
    fullPhone: parsed.fullPhone,
    region: rule.name
  }
}

function isValidPhone(phone) {
  return validatePhone(phone).valid
}

function normalizePhone(phone) {
  const parsed = parsePhoneNumber(phone)
  if (!parsed.countryCode) return cleanPhone(phone)
  if (parsed.countryCode === '86') return parsed.purePhone
  return `${parsed.countryCode}${parsed.purePhone}`
}

function generatePhoneMatchList(phoneNumber, purePhoneNumber, countryCode) {
  const matchList = []
  const add = (value) => {
    const clean = cleanPhone(value)
    if (clean) matchList.push(clean)
  }

  add(purePhoneNumber)
  if (countryCode && purePhoneNumber) {
    add(`${countryCode}${cleanPhone(purePhoneNumber)}`)
    add(`+${countryCode}${cleanPhone(purePhoneNumber)}`)
  }
  add(phoneNumber)
  if (phoneNumber && cleanPhone(phoneNumber).startsWith('+')) {
    add(cleanPhone(phoneNumber).substring(1))
  }

  const parsed = parsePhoneNumber(phoneNumber || (countryCode && purePhoneNumber ? `+${countryCode}${purePhoneNumber}` : purePhoneNumber))
  if (parsed.purePhone) add(parsed.purePhone)
  if (parsed.countryCode && parsed.purePhone) {
    add(`${parsed.countryCode}${parsed.purePhone}`)
    add(parsed.fullPhone)
  }
  if (parsed.purePhone && !parsed.countryCode) {
    add(`86${parsed.purePhone}`)
  }

  return [...new Set(matchList)]
}

function getPhoneParts(phoneNumber, purePhoneNumber, countryCode) {
  const explicitPure = cleanPhone(purePhoneNumber)
  const explicitCountry = cleanPhone(countryCode)
  if (explicitPure && explicitCountry) {
    return {
      phoneNumber: cleanPhone(phoneNumber) || `+${explicitCountry}${explicitPure}`,
      purePhone: explicitPure,
      countryCode: explicitCountry,
      fullPhone: `+${explicitCountry}${explicitPure}`
    }
  }

  const parsed = parsePhoneNumber(phoneNumber || purePhoneNumber)
  return {
    phoneNumber: cleanPhone(phoneNumber) || parsed.fullPhone,
    purePhone: explicitPure || parsed.purePhone,
    countryCode: explicitCountry || parsed.countryCode,
    fullPhone: parsed.fullPhone
  }
}

module.exports = {
  PHONE_RULES,
  parsePhoneNumber,
  validatePhone,
  isValidPhone,
  normalizePhone,
  generatePhoneMatchList,
  getPhoneParts
}
