/**
 * 云函数：init_content_data
 * 功能：初始化工具包和课程示例数据
 * 权限：仅管理员（roles=0）
 * 
 * 说明：
 * 此云函数用于将小程序端硬编码的默认数据导入数据库
 * 导入后，后台管理系统可以对这些数据进行管理
 * 小程序端会优先从数据库加载数据
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 默认工具包数据
const DEFAULT_TOOLKIT = {
  toolkitId: 'TK_DEFAULT_001',
  title: '灯光设计工具包',
  description: '十年灯光设计知识沉淀、方法技巧、核心工具、灯光资源、避坑经验全都在这里！告别盲目设计灯光的烦恼，科学专业的灯光设计方法让你对设计决策更加笃定。',
  price: 0.01,
  originalPrice: 399,
  cover: '',
  images: [
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图2.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图3.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图4.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图5.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图6.jpg'
  ],
  // 网盘交付配置（请在后台配置实际的网盘链接）
  driveLink: '',
  drivePassword: '',
  contentList: [
    { title: '空间照度验算计算文件', desc: '多维度综合智能照度计算表，包含常用材质利用系数参考' },
    { title: '住宅建筑照明设计标准', desc: '专业标准化可编辑的施工图模板，CAD直接可用' },
    { title: '深化施工图纸模板', desc: '施工节点大样图库，包含各种灯具安装节点详图' },
    { title: '品牌灯具选型报价表', desc: '进口/国产专业照明品牌库推荐，包含详细参数对比' },
    { title: '灯具安装节点大样案例图', desc: '灯光设计施工安装翻车黑名单，避免常见错误' },
    { title: '灯光设计常用灯具使用规则', desc: '灯光设计常用灯具参数运用规则，科学选型指导' }
  ],
  params: [
    { key: '产品类型', value: '数字工具包' },
    { key: '文件格式', value: 'PDF、DWG、XLSX、PNG、JPG' },
    { key: '适用场景', value: '住宅、商业、办公、酒店照明设计' },
    { key: '更新频率', value: '季度更新' },
    { key: '技术支持', value: '专业社群交流学习' },
    { key: '授权方式', value: '个人使用授权' }
  ],
  variantGroups: [
    { key: 'version', name: '版本选择', options: ['标准版'] }
  ],
  targetGroups: [
    {
      title: '设计师、照明行业从业者',
      features: [
        '掌握灯光设计的科学照度计算',
        '了解住宅照明设计标准',
        '加快科学灯光设计落地操作'
      ]
    },
    {
      title: '装修业主、自装达人',
      features: [
        '拥有专属自己的"灯光字典"',
        '快速了解照明行业专业知识',
        '打破信息闭塞，营造健康居住环境'
      ]
    }
  ],
  category: 'calculation',
  tags: ['灯光设计', '照度计算', 'CAD图纸', '设计标准'],
  favoriteCount: 0,
  salesCount: 0,  // 销量
  rating: 4.8,
  ratingCount: 126,
  status: 'active',
  isDelete: 0,
  createdAt: Date.now(),
  updatedAt: Date.now()
}

// 默认课程数据
const DEFAULT_COURSE = {
  courseId: 'CO_DEFAULT_001',
  title: '十年经验二哥 灯光设计课',
  description: '系统梳理十年一线灯光设计实战经验，讲解设计思维、方法与落地技巧。',
  price: 0.01,
  originalPrice: 365,
  cover: '',
  images: [
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图1-¥365有圈子的灯光课 5.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图2-¥365有圈子的灯光课 6.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图3-¥365有圈子的灯光课 7.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图4-¥365有圈子的灯光课 8.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图5-¥365有圈子的灯光课.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图6-¥365有圈子的灯光课 3.jpg',
    'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图7-¥365有圈子的灯光课 2.jpg'
  ],
  detailImage: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/详情图-¥365有圈子的灯光课 4.jpg',
  // 网盘交付配置（请在后台配置实际的网盘链接）
  driveLink: '',
  drivePassword: '',
  benefits: [
    '完整灯光设计方法论',
    '从需求到落地的流程打法',
    '常见场景案例复盘',
    '避坑与调试技巧'
  ],
  highlights: [
    '十年一线实战经验',
    '系统化设计思维',
    '可落地的方法论',
    '专属学习社群'
  ],
  targetAudience: '设计师、照明行业从业者、装修业主、自装达人',
  instructorId: 'd001',
  instructorName: '二哥',
  instructorAvatar: '',
  category: '照明基础',
  level: 'intermediate',
  tags: ['灯光设计', '照明设计', '实战经验', '方法论'],
  salesCount: 0,  // 销量
  rating: 4.9,
  ratingCount: 89,
  status: 'published',
  isDelete: 0,
  createdAt: Date.now(),
  updatedAt: Date.now()
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 简单的权限检查（可根据需要增强）
    if (!openid) {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        errorMessage: '需要登录才能执行此操作'
      }
    }
    
    // 检查用户是否为管理员
    const userRes = await db.collection('users').where({
      _openid: openid,
      roles: 0,
      isDelete: _.neq(1)
    }).get()
    
    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        code: 'FORBIDDEN',
        errorMessage: '仅管理员可执行此操作'
      }
    }
    
    const { action = 'all', force = false } = event
    const results = { toolkit: null, course: null }
    
    // 初始化工具包数据
    if (action === 'all' || action === 'toolkit') {
      // 检查是否已存在
      const existingToolkit = await db.collection('toolkits').where({
        toolkitId: DEFAULT_TOOLKIT.toolkitId
      }).get()
      
      if (existingToolkit.data && existingToolkit.data.length > 0) {
        if (force) {
          // 强制更新
          await db.collection('toolkits').doc(existingToolkit.data[0]._id).update({
            data: {
              ...DEFAULT_TOOLKIT,
              updatedAt: Date.now()
            }
          })
          results.toolkit = { action: 'updated', id: existingToolkit.data[0]._id }
        } else {
          results.toolkit = { action: 'skipped', reason: '工具包已存在', id: existingToolkit.data[0]._id }
        }
      } else {
        // 新增
        const addRes = await db.collection('toolkits').add({
          data: DEFAULT_TOOLKIT
        })
        results.toolkit = { action: 'created', id: addRes._id }
      }
    }
    
    // 初始化课程数据
    if (action === 'all' || action === 'course') {
      // 检查是否已存在
      const existingCourse = await db.collection('courses').where({
        courseId: DEFAULT_COURSE.courseId
      }).get()
      
      if (existingCourse.data && existingCourse.data.length > 0) {
        if (force) {
          // 强制更新
          await db.collection('courses').doc(existingCourse.data[0]._id).update({
            data: {
              ...DEFAULT_COURSE,
              updatedAt: Date.now()
            }
          })
          results.course = { action: 'updated', id: existingCourse.data[0]._id }
        } else {
          results.course = { action: 'skipped', reason: '课程已存在', id: existingCourse.data[0]._id }
        }
      } else {
        // 新增
        const addRes = await db.collection('courses').add({
          data: DEFAULT_COURSE
        })
        results.course = { action: 'created', id: addRes._id }
      }
    }
    
    return {
      success: true,
      code: 'OK',
      data: results,
      message: '初始化数据完成'
    }
    
  } catch (err) {
    console.error('[init_content_data] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

