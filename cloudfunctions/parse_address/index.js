const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

/**
 * 智能地址解析云函数 v2
 * 输入一段包含收货信息的文本，精准拆分出：姓名、手机号、省、市、区、详细地址
 * 
 * 支持的格式：
 * - "张三 13800138000 广东省广州市南沙区明珠路1号"
 * - "广东省广州市天河区天河路123号 张三 13800138000"
 * - "张三，13800138000，广东省广州市南沙区明珠路1号"
 * - "收货人：张三 电话：13800138000 地址：广东省广州市..."
 * - "张三13800138000广东省广州市南沙区明珠路1号"（无分隔符）
 * - "姓名 张三 手机 138-0013-8000 地址 广东省广州市..."
 * - 电商平台复制格式、各种混合格式
 */
exports.main = async (event) => {
  try {
    const { text } = event
    if (!text || typeof text !== 'string') {
      return { success: false, message: '请提供地址文本' }
    }

    console.log('[parse_address] 原始输入:', text.substring(0, 100))
    const result = parseAddress(text.trim())
    console.log('[parse_address] 解析结果:', JSON.stringify(result))
    return result
  } catch (err) {
    console.error('[parse_address] 解析失败:', err)
    return { success: false, message: err.message || '解析失败' }
  }
}

// ==================== 省市区数据 ====================

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

// 常见中文姓氏（百家姓 Top100+，用于辅助姓名识别）
const COMMON_SURNAMES = [
  '王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周',
  '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '高', '罗',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹',
  '彭', '曾', '萧', '田', '董', '潘', '袁', '蔡', '蒋', '余',
  '于', '杜', '叶', '程', '魏', '苏', '吕', '丁', '任', '沈',
  '姚', '卢', '傅', '钟', '姜', '崔', '谭', '廖', '范', '汪',
  '陆', '金', '石', '戴', '贾', '韦', '夏', '邱', '方', '侯',
  '邹', '熊', '孟', '秦', '白', '江', '阎', '薛', '闫', '段',
  '雷', '龙', '黎', '史', '陶', '贺', '毛', '郝', '顾', '龚',
  '邵', '万', '覃', '武', '钱', '戚', '严', '欧阳', '上官', '司马',
  '诸葛', '慕容', '令狐', '皇甫', '尉迟', '公孙', '长孙', '南宫'
]

/**
 * 主解析函数
 */
function parseAddress(text) {
  // ===== 第一步：标签提取（最高优先级）=====
  // 如果文本中有明确标签，优先按标签提取
  const labelResult = extractByLabels(text)
  
  // ===== 第二步：预处理 =====
  let cleaned = text
    // 移除已被标签提取的内容相关标签文字
    .replace(/收货人[：:]\s*/g, ' ')
    .replace(/收件人[：:]\s*/g, ' ')
    .replace(/姓名[：:]\s*/g, ' ')
    .replace(/联系电话[：:]\s*/g, ' ')
    .replace(/联系方式[：:]\s*/g, ' ')
    .replace(/手机号码?[：:]\s*/g, ' ')
    .replace(/电话[：:]\s*/g, ' ')
    .replace(/手机[：:]\s*/g, ' ')
    .replace(/详细地址[：:]\s*/g, ' ')
    .replace(/收货地址[：:]\s*/g, ' ')
    .replace(/所在地区[：:]\s*/g, ' ')
    .replace(/地\s*址[：:]\s*/g, ' ')
    .replace(/邮编[：:]\s*\d{6}/g, ' ')
    .replace(/邮政编码[：:]\s*\d{6}/g, ' ')
    .replace(/\d{6}(?=\s|$)/g, ' ')  // 独立的6位数字（邮编）
    .replace(/[,，;；|、\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // ===== 第三步：提取手机号 =====
  let phone = labelResult.phone || ''
  if (!phone) {
    phone = extractPhone(cleaned)
  }
  // 从 cleaned 中移除手机号
  if (phone) {
    // 移除各种格式的手机号
    cleaned = cleaned
      .replace(new RegExp('\\+?86[-\\s]?' + phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1[-\\s]?$2[-\\s]?$3')), ' ')
      .replace(phone, ' ')
      .replace(/\s+/g, ' ').trim()
  }

  // ===== 第四步：提取省市区 =====
  const regionResult = extractRegion(cleaned)
  let province = regionResult.province
  let city = regionResult.city
  let district = regionResult.district
  let remainAfterRegion = regionResult.remain

  // ===== 第五步：分离姓名和详细地址 =====
  let name = labelResult.name || ''
  let detail = ''

  if (name) {
    // 标签已提取到姓名，从剩余文本中移除姓名，剩下的就是详细地址
    remainAfterRegion = remainAfterRegion.replace(name, ' ').replace(/\s+/g, ' ').trim()
    detail = cleanDetail(remainAfterRegion)
  } else {
    // 未通过标签提取到姓名，用启发式方法
    const nameDetail = extractNameAndDetail(remainAfterRegion, province, phone)
    name = nameDetail.name
    detail = cleanDetail(nameDetail.detail)
  }

  // ===== 第六步：最终清理 =====
  // 如果 detail 仍然包含手机号，移除
  if (phone && detail.includes(phone)) {
    detail = detail.replace(phone, '').replace(/\s+/g, ' ').trim()
  }
  // 如果 detail 包含姓名且姓名不像地址片段，移除
  if (name && detail.includes(name) && !isLikelyAddress(name)) {
    detail = detail.replace(name, '').replace(/\s+/g, ' ').trim()
  }

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
 * 通过标签精准提取信息
 * 支持格式如："收货人：张三" "电话：13800138000" "地址：广东省..."
 */
function extractByLabels(text) {
  let name = ''
  let phone = ''

  // 提取姓名（标签后面跟的内容，到下一个标签或分隔符为止）
  const nameLabels = /(?:收货人|收件人|姓名|联系人)[：:]\s*([^\s,，;；、\n\r]{1,25})/
  const nameMatch = text.match(nameLabels)
  if (nameMatch) {
    let candidate = nameMatch[1].trim()
    // 如果提取到的内容以数字开头，可能误提取了，只取非数字部分
    candidate = candidate.replace(/\d.*$/, '').trim()
    if (candidate && candidate.length >= 1 && candidate.length <= 25) {
      name = candidate
    }
  }

  // 提取手机号（标签后面跟的数字）
  const phoneLabels = /(?:联系电话|联系方式|手机号码?|电话|手机|TEL|tel)[：:]\s*\+?86[-\s]?(1[3-9]\d{1}[-\s]?\d{4}[-\s]?\d{4})/
  const phoneMatch = text.match(phoneLabels)
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/[-\s]/g, '')
  }

  // 如果标签提取失败，也尝试简单的标签格式
  if (!phone) {
    const phoneLabels2 = /(?:联系电话|联系方式|手机号码?|电话|手机|TEL|tel)[：:]\s*(\d[\d\s-]{9,15})/
    const phoneMatch2 = text.match(phoneLabels2)
    if (phoneMatch2) {
      const cleaned = phoneMatch2[1].replace(/[-\s]/g, '')
      if (/^1[3-9]\d{9}$/.test(cleaned)) {
        phone = cleaned
      }
    }
  }

  return { name, phone }
}

/**
 * 提取手机号
 * 支持多种格式：
 * - 标准11位：13800138000
 * - 带+86前缀：+8613800138000
 * - 带86前缀：8613800138000
 * - 带分隔符：138-0013-8000 / 138 0013 8000
 */
function extractPhone(text) {
  // 1. 带+86前缀
  const withPlusMatch = text.match(/\+86[-\s]?(1[3-9]\d[-\s]?\d{4}[-\s]?\d{4})/)
  if (withPlusMatch) {
    return withPlusMatch[1].replace(/[-\s]/g, '')
  }

  // 2. 带86前缀（确保86前面不是其他数字）
  const with86Match = text.match(/(?<!\d)86[-\s]?(1[3-9]\d[-\s]?\d{4}[-\s]?\d{4})/)
  if (with86Match) {
    return with86Match[1].replace(/[-\s]/g, '')
  }

  // 3. 标准11位（确保前后不是数字）
  const standardMatch = text.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/)
  if (standardMatch) {
    return standardMatch[1]
  }

  // 4. 带分隔符的手机号
  const sepMatch = text.match(/(?<!\d)(1[3-9]\d)[-\s](\d{4})[-\s](\d{4})(?!\d)/)
  if (sepMatch) {
    return sepMatch[1] + sepMatch[2] + sepMatch[3]
  }

  // 5. 紧挨在中文后面的手机号（如"张三13800138000"）
  const attachedMatch = text.match(/[\u4e00-\u9fa5](1[3-9]\d{9})(?!\d)/)
  if (attachedMatch) {
    return attachedMatch[1]
  }

  return ''
}

/**
 * 提取省市区
 */
function extractRegion(text) {
  let province = '', city = '', district = ''
  let remain = text

  // ===== 省份匹配 =====
  // 先尝试完整后缀匹配：XX省、XX自治区
  let provinceMatch = text.match(/((?:内蒙古|黑龙江|新疆维吾尔|宁夏回族|广西壮族|西藏)(?:自治区)?|[^\s,，;；]{2,3}(?:省))/)
  
  if (provinceMatch) {
    let matched = provinceMatch[0]
    let pName = matched.replace(/(省|自治区)$/, '')
    if (PROVINCES.some(p => pName.startsWith(p) || p.startsWith(pName))) {
      province = matched
      remain = remain.replace(matched, '')
    }
  }

  // 如果没匹配到带后缀的，尝试简称匹配
  if (!province) {
    for (const p of PROVINCES) {
      const idx = remain.indexOf(p)
      if (idx !== -1) {
        const afterP = remain.substring(idx + p.length)
        if (afterP.match(/^(省|市|自治区|特别行政区)?/) || MUNICIPALITIES.includes(p) || SAR.includes(p)) {
          province = p
          if (MUNICIPALITIES.includes(p)) {
            province = p + '市'
          } else if (AUTONOMOUS_REGIONS[p]) {
            province = AUTONOMOUS_REGIONS[p]
          } else if (SAR.includes(p)) {
            province = p + '特别行政区'
          } else if (!province.endsWith('省')) {
            province = p + '省'
          }
          const pRegex = new RegExp(p + '(省|市|自治区|特别行政区|壮族自治区|维吾尔自治区|回族自治区)?')
          remain = remain.replace(pRegex, '')
          break
        }
      }
    }
  }

  // ===== 市级匹配 =====
  const isMunicipality = MUNICIPALITIES.some(m => province.startsWith(m))
  
  if (isMunicipality) {
    city = province
  } else {
    const cityMatch = remain.match(/([^\s,，]{2,8}?(?:市|自治州|地区|盟))/)
    if (cityMatch) {
      city = cityMatch[1]
      remain = remain.replace(city, '')
    }
  }

  // ===== 区/县匹配 =====
  // 先尝试匹配更具体的模式
  const districtMatch = remain.match(/([^\s,，]{2,8}?(?:区|县|自治县|旗|自治旗|林区|特区))/) ||
                         remain.match(/([^\s,，]{2,6}?(?:市))/)  // 县级市
  if (districtMatch) {
    district = districtMatch[1]
    remain = remain.replace(district, '')
  }

  remain = remain.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ')

  return { province, city, district, remain }
}

/**
 * 从剩余文本中分离姓名和详细地址
 * 
 * 改进策略：
 * 1. 先检查是否有常见姓氏开头的短词
 * 2. 利用文本位置（开头/末尾的短词更可能是姓名）
 * 3. 地址关键字排除
 * 4. 支持无分隔符的「姓名+地址」拆分
 */
function extractNameAndDetail(text, province, phone) {
  if (!text) return { name: '', detail: '' }

  // 尝试处理无空格的情况："张三明珠路1号" -> "张三" + "明珠路1号"
  // 检测开头是否是姓名（常见姓氏开头 + 后面紧跟地址关键字）
  const noSpaceSplit = tryExtractNameWithoutSpace(text)
  if (noSpaceSplit) {
    return noSpaceSplit
  }

  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { name: '', detail: '' }
  if (parts.length === 1) {
    if (isLikelyName(parts[0]) && !isLikelyAddress(parts[0])) {
      return { name: parts[0], detail: '' }
    }
    return { name: '', detail: parts[0] }
  }

  // 多段文本：评分式判断
  let bestNameIdx = -1
  let bestNameScore = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (isLikelyAddress(part)) continue
    
    let score = 0
    if (isLikelyName(part)) score += 5
    if (hasCommonSurname(part)) score += 3
    // 开头位置加分
    if (i === 0) score += 2
    // 末尾位置稍微加分
    if (i === parts.length - 1) score += 1
    // 长度2-4的纯中文名加分
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(part)) score += 2
    // 包含数字的减分
    if (/\d/.test(part)) score -= 10
    
    if (score > bestNameScore) {
      bestNameScore = score
      bestNameIdx = i
    }
  }

  let name = ''
  let detailParts = []

  if (bestNameScore >= 5 && bestNameIdx >= 0) {
    name = parts[bestNameIdx]
    detailParts = parts.filter((_, i) => i !== bestNameIdx)
  } else {
    detailParts = parts
  }

  return {
    name,
    detail: detailParts.join(' ')
  }
}

/**
 * 尝试从无空格文本中拆分姓名
 * 例如："张三明珠路1号" -> { name: '张三', detail: '明珠路1号' }
 */
function tryExtractNameWithoutSpace(text) {
  if (!text || text.includes(' ')) return null
  if (text.length < 4) return null  // 太短不处理

  // 检查是否以常见姓氏开头
  for (const surname of COMMON_SURNAMES) {
    if (!text.startsWith(surname)) continue
    
    // 尝试不同长度的姓名（姓 + 1~3字名）
    for (let nameLen = surname.length + 1; nameLen <= Math.min(surname.length + 3, text.length - 1); nameLen++) {
      const candidateName = text.substring(0, nameLen)
      const candidateDetail = text.substring(nameLen)
      
      // 验证：名字部分应该是纯中文/字母，地址部分应该有地址特征或以数字开头
      if (isLikelyName(candidateName) && 
          (isLikelyAddress(candidateDetail) || /^\d/.test(candidateDetail))) {
        return { name: candidateName, detail: candidateDetail }
      }
    }
  }
  
  return null
}

/**
 * 判断是否包含常见姓氏
 */
function hasCommonSurname(str) {
  if (!str) return false
  return COMMON_SURNAMES.some(s => str.startsWith(s))
}

/**
 * 判断是否像人名
 * 支持：中文名（2-4字）、英文名（1-20字母）、中英混合
 */
function isLikelyName(str) {
  if (!str) return false
  // 包含数字 → 不是名字
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
  return /[路街巷号栋楼层室村镇乡组弄苑园城邨里道坊桥站大厦花园小区公寓中心广场工业园科技园产业园创业园物流园商务区经济区开发区保税区]/.test(str)
}

/**
 * 清理详细地址文本
 */
function cleanDetail(detail) {
  if (!detail) return ''
  return detail
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s{2,}/g, ' ')
    // 移除开头的无意义分隔符
    .replace(/^[,，;；、\s]+/, '')
    .replace(/[,，;；、\s]+$/, '')
}
