// 模拟课程数据
// 模拟视频地址
const MOCK_VIDEO_URL = "https://cloud-minapp-36768.cloud.tencent-cos.cn/video/sample_nature_720p.mp4"; // 仅为示例,后续替换

const courses = [
  {
    id: 'c001',
    title: '二哥十年经验灯光课（正课）',
    subtitle: '零基础到精通,掌握专业灯光设计核心逻辑',
    coverUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop',
    price: 999,
    originalPrice: 1299,
    instructor: {
      name: '二哥',
      title: '资深灯光设计师',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=2070&auto=format&fit=crop'
    },
    description: '本课程汇聚了二哥十年一线灯光设计经验,从基础理论到实战案例,手把手教你如何用光创造空间价值。包含全套视频教程及大量实战图纸资料。',
    tags: ['灯光设计', '实战案例', '包含资料'],
    chapters: [
      {
        title: '第一章：灯光设计底层逻辑',
        lessons: [
          { id: 'l1-1', title: '1.1 光的物理属性与情感表达', type: 'video', duration: '15:20', isFree: true, videoUrl: MOCK_VIDEO_URL },
          { id: 'l1-2', title: '1.2 色温与显色性的应用法则', type: 'video', duration: '18:45', isFree: true, videoUrl: MOCK_VIDEO_URL },
          { id: 'l1-3', title: '1.3 常见布光误区解析', type: 'video', duration: '12:30', isFree: false, videoUrl: MOCK_VIDEO_URL }
        ]
      },
      {
        title: '第二章：住宅空间布光实战',
        lessons: [
          { id: 'l2-1', title: '2.1 客厅无主灯设计全流程', type: 'video', duration: '25:10', isFree: false, videoUrl: MOCK_VIDEO_URL },
          { id: 'l2-2', title: '2.2 卧室氛围营造与阅读照明', type: 'video', duration: '22:15', isFree: false, videoUrl: MOCK_VIDEO_URL },
          { id: 'l2-3', title: '2.3 餐厨空间的色温搭配', type: 'video', duration: '19:40', isFree: false, videoUrl: MOCK_VIDEO_URL }
        ]
      },
      {
        title: '课程资料包',
        lessons: [
          { id: 'm1', title: '灯光设计常用参数表.pdf', type: 'file', size: '2.5MB', format: 'PDF' },
          { id: 'm2', title: '实战案例CAD图纸.dwg', type: 'file', size: '15.8MB', format: 'DWG' },
          { id: 'm3', title: '灯具选型清单.xlsx', type: 'file', size: '1.2MB', format: 'XLSX' }
        ]
      }
    ]
  },
  {
    id: 'c002',
    title: 'DIALux evo 仿真模拟进阶',
    subtitle: '让你的灯光方案更有说服力',
    coverUrl: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?q=80&w=2070&auto=format&fit=crop',
    price: 399,
    originalPrice: 599,
    tags: ['软件教程', '仿真模拟'],
    description: '深入讲解DIALux evo高级功能,从建模到渲染输出,快速产出高质量光效模拟图。'
  },
  {
    id: 'c003',
    title: '酒店照明设计规范与实践',
    subtitle: '商业空间灯光设计进阶',
    coverUrl: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2070&auto=format&fit=crop',
    price: 799,
    tags: ['商业空间', '规范解读'],
    description: '从酒店大堂到客房走廊,掌握高端商业空间的照明设计要点与行业标准。'
  }
];

const getCourseById = (id) => {
  return courses.find(c => c.id === id);
};

// 使用 CommonJS 导出
module.exports = {
  courses,
  getCourseById
};
