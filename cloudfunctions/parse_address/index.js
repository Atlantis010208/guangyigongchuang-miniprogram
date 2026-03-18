const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

/**
 * 智能地址解析云函数
 * 输入一段包含收货信息的文本，精准拆分出：姓名、手机号、省、市、区、详细地址
 * 
 * 支持的格式：
 * - "张三 13800138000 广东省广州市南沙区 123 514"
 * - "广东省广州市天河区天河路123号 张三 13800138000"
 * - "张三，13800138000，广东省广州市南沙区明珠路1号"
 * - "收货人：张三 电话：13800138000 地址：广东省广州市..."
 * - 各种混合格式
 */
exports.main = async (event) => {
  try {
    const { text } = event
    if (!text || typeof text !== 'string') {
      return { success: false, message: '请提供地址文本' }
    }

    const result = parseAddress(text.trim())
    return { success: true, data: result }
  } catch (err) {
    console.error('[parse_address] 解析失败:', err)
    return { success: false, message: err.message || '解析失败' }
  }
}

// ==================== 省市区数据（精简版，覆盖全国） ====================

// 直辖市
const MUNICIPALITIES = ['北京', '天津', '上海', '重庆']

// 自治区简称映射
const AUTONOMOUS_REGIONS = {
  '内蒙古': '内蒙古自治区',
  '广西': '广西壮族自治区',
  '西藏': '西藏自治区',
  '宁夏': '宁夏回族自治区',
  '新疆': '新疆维吾尔自治区'
}

// 特别行政区
const SAR = ['香港', '澳门']

// 省份列表（用于匹配）
const PROVINCES = [
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西',
  '山东', '河南', '湖北', '湖南', '广东',
  '海南', '四川', '贵州', '云南', '陕西',
  '甘肃', '青海', '台湾',
  ...MUNICIPALITIES,
  ...Object.keys(AUTONOMOUS_REGIONS),
  ...SAR
]

/**
 * 主解析函数
 */
function parseAddress(text) {
  // 预处理：统一分隔符，去除常见标签
  let cleaned = text
    .replace(/收货人[：:]/g, ' ')
    .replace(/姓名[：:]/g, ' ')
    .replace(/联系电话[：:]/g, ' ')
    .replace(/电话[：:]/g, ' ')
    .replace(/手机[：:]/g, ' ')
    .replace(/地址[：:]/g, ' ')
    .replace(/详细地址[：:]/g, ' ')
    .replace(/所在地区[：:]/g, ' ')
    .replace(/邮编[：:]\s*\d{6}/g, ' ')  // 移除邮编
    .replace(/[,，;；|/、\n\r\t]+/g, ' ')  // 统一分隔符为空格
    .replace(/\s+/g, ' ')
    .trim()

  // 1. 提取手机号（11位，1开头）
  let phone = ''
  const phoneMatch = cleaned.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/)
  if (phoneMatch) {
    phone = phoneMatch[1]
    cleaned = cleaned.replace(phone, ' ').trim()
  }

  // 也尝试匹配带分隔符的手机号，如 138-0013-8000 / 138 0013 8000
  if (!phone) {
    const phoneMatch2 = cleaned.match(/(1[3-9]\d)[\s-]?(\d{4})[\s-]?(\d{4})/)
    if (phoneMatch2) {
      phone = phoneMatch2[1] + phoneMatch2[2] + phoneMatch2[3]
      cleaned = cleaned.replace(phoneMatch2[0], ' ').trim()
    }
  }

  // 2. 提取省市区
  const regionResult = extractRegion(cleaned)
  let province = regionResult.province
  let city = regionResult.city
  let district = regionResult.district
  let remainAfterRegion = regionResult.remain

  // 3. 从剩余文本中分离姓名和详细地址
  const { name, detail } = extractNameAndDetail(remainAfterRegion, province)

  return {
    name: name.trim(),
    phone,
    province,
    city,
    district,
    region: [province, city, district].filter(Boolean),
    detail: detail.trim()
  }
}

/**
 * 提取省市区
 */
function extractRegion(text) {
  let province = '', city = '', district = ''
  let remain = text

  // ===== 省份匹配 =====
  // 先尝试完整后缀匹配：XX省、XX自治区
  let provinceMatch = text.match(/((?:内蒙古|黑龙江|新疆维吾尔|宁夏回族|广西壮族|西藏)(?:自治区)?|[^省市区县]{2,3}(?:省))/)
  
  if (provinceMatch) {
    let matched = provinceMatch[0]
    // 标准化省份名
    let pName = matched.replace(/(省|自治区)$/, '')
    // 确认是有效省份
    if (PROVINCES.some(p => pName.startsWith(p) || p.startsWith(pName))) {
      province = matched
      remain = remain.replace(matched, '')
    }
  }

  // 如果没匹配到带后缀的，尝试简称匹配
  if (!province) {
    for (const p of PROVINCES) {
      const idx = text.indexOf(p)
      if (idx !== -1) {
        // 确认后面跟的是市/区/县等，避免误匹配
        const afterP = text.substring(idx + p.length)
        if (afterP.match(/^(省|市|自治区|特别行政区)?/) || MUNICIPALITIES.includes(p) || SAR.includes(p)) {
          province = p
          // 补全后缀
          if (MUNICIPALITIES.includes(p)) {
            province = p + '市'
          } else if (AUTONOMOUS_REGIONS[p]) {
            province = AUTONOMOUS_REGIONS[p]
          } else if (SAR.includes(p)) {
            province = p + '特别行政区'
          } else if (!province.endsWith('省')) {
            province = p + '省'
          }
          // 从文本中移除省份部分（包括可能的后缀）
          const pRegex = new RegExp(p + '(省|市|自治区|特别行政区|壮族自治区|维吾尔自治区|回族自治区)?')
          remain = remain.replace(pRegex, '')
          break
        }
      }
    }
  }

  // ===== 市级匹配 =====
  // 直辖市特殊处理
  const isMunicipality = MUNICIPALITIES.some(m => province.startsWith(m))
  
  if (isMunicipality) {
    // 直辖市：省和市同名
    city = province
  } else {
    // 普通省份：匹配 XX市 / XX自治州 / XX地区 / XX盟
    const cityMatch = remain.match(/([^\s]{2,6}?(?:市|自治州|地区|盟))/)
    if (cityMatch) {
      city = cityMatch[1]
      remain = remain.replace(city, '')
    }
  }

  // ===== 区/县匹配 =====
  const districtMatch = remain.match(/([^\s]{2,6}?(?:区|县|自治县|旗|自治旗|市))/)
  if (districtMatch) {
    district = districtMatch[1]
    remain = remain.replace(district, '')
  }

  // 清理省市区匹配后留下的多余空格
  remain = remain.replace(/\s+/g, ' ').trim()

  return { province, city, district, remain }
}

/**
 * 从剩余文本中分离姓名和详细地址
 * 
 * 核心规则：
 * - 中文姓名通常2-4个字
 * - 如果剩余文本开头是短词（2-4字、纯中文、无地址特征），很可能是姓名
 * - 如果剩余文本末尾是短词，也可能是姓名
 * - 地址通常包含路/街/巷/号/栋/楼/村/镇/小区等关键字
 */
function extractNameAndDetail(text, province) {
  if (!text) return { name: '', detail: '' }

  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { name: '', detail: '' }
  if (parts.length === 1) {
    // 只有一段文本：判断是姓名还是地址
    if (isLikelyName(parts[0])) {
      return { name: parts[0], detail: '' }
    }
    return { name: '', detail: parts[0] }
  }

  // 多段文本：逐段判断
  let name = ''
  let detailParts = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!name && isLikelyName(part) && !isLikelyAddress(part)) {
      name = part
    } else {
      detailParts.push(part)
    }
  }

  // 如果没找到名字，检查最后一段是否像名字（有些人把名字放最后）
  if (!name && detailParts.length > 1) {
    const lastPart = detailParts[detailParts.length - 1]
    if (isLikelyName(lastPart) && !isLikelyAddress(lastPart)) {
      name = lastPart
      detailParts.pop()
    }
  }

  return {
    name,
    detail: detailParts.join('')
  }
}

/**
 * 判断是否像人名
 * 支持：中文名（2-4字）、英文名（1-20字母）、中英混合
 */
function isLikelyName(str) {
  if (!str) return false
  // 包含数字 → 不是名字（可能是门牌号之类）
  if (/\d/.test(str)) return false
  // 纯中文 2-4 字
  if (/^[\u4e00-\u9fa5]{2,4}$/.test(str)) return true
  // 纯英文（允许空格、点、横杠，长度1-20）
  if (/^[A-Za-z][A-Za-z\s.\-']{0,19}$/.test(str) && str.length <= 20) return true
  // 中英混合（如"张San"）
  if (/^[\u4e00-\u9fa5A-Za-z\s.\-']{2,10}$/.test(str) && !isLikelyAddress(str)) return true
  return false
}

/**
 * 判断是否像地址
 */
function isLikelyAddress(str) {
  if (!str) return false
  return /[路街巷号栋楼层室村镇乡组弄苑园城邨里道坊桥站大厦花园小区公寓中心广场]/.test(str)
}
