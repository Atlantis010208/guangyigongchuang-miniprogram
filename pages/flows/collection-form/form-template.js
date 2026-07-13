const option = (id, label) => ({ id, label })

const FORM_TEMPLATE = {
  id: 'lighting-needs-demo',
  version: 1,
  title: '灯光设计需求收集',
  modules: [
    {
      id: 'project',
      code: 'A',
      title: '项目概况',
      description: '本模块用于了解项目基础信息，共 4 题',
      estimatedMinutes: 1,
      questions: [
        {
          id: 'a1_project_name', code: 'A1', type: 'shortText', required: true,
          title: '请填写项目名称', placeholder: '请输入项目名称',
          validation: { minLength: 2, maxLength: 40 },
        },
        {
          id: 'a2_location', code: 'A2', type: 'shortText', required: true,
          title: '项目位于哪里？', placeholder: '请选择城市或输入地址', action: 'chooseLocation',
          validation: { minLength: 2, maxLength: 80 },
        },
        {
          id: 'a3_area', code: 'A3', type: 'number', required: true,
          title: '项目面积约多少？', placeholder: '请输入项目面积', unit: '㎡',
          validation: { min: 1, max: 100000 },
        },
        {
          id: 'a4_stage', code: 'A4', type: 'single', required: true,
          title: '项目目前处于哪个阶段？',
          options: [
            option('not_started', '未开工'), option('utilities', '水电阶段'),
            option('woodwork', '木工阶段'), option('finishing', '硬装收尾'),
          ],
        },
      ],
    },
    {
      id: 'goals',
      code: 'B',
      title: '核心目标',
      description: '本模块用于确认您最关注的目标，共 5 题',
      estimatedMinutes: 2,
      questions: [
        {
          id: 'b1_atmosphere', code: 'B1', type: 'multiple', required: true,
          title: '您希望空间是什么感觉？', description: '（多选）',
          options: [
            option('warm', '温馨舒适'), option('bright', '明亮通透'),
            option('quiet', '安静放松'), option('premium', '高级克制'),
            option('layered', '有层次感'),
          ],
          validation: { minSelections: 1 },
        },
        {
          id: 'b2_redlines', code: 'B2', type: 'multiple', required: true,
          title: '以下哪些情况最不能接受？', description: '（最多选 3 项）',
          options: [
            option('glare', '灯光刺眼'), option('flat', '效果不落地'),
            option('waste', '太暗不实用'), option('complex', '智能控制太复杂'),
            option('maintenance', '后期难维护'),
          ],
          validation: { minSelections: 1, maxSelections: 3 },
        },
        {
          id: 'b3_priorities', code: 'B3', type: 'ranking', required: true,
          title: '请按优先级排列灯光目标', description: '长按选项并拖动，最重要的放在最上方',
          options: [
            option('comfort', '长期使用舒适'), option('quality', '空间高级感'),
            option('function', '功能照明完善'), option('budget', '预算可控'),
            option('maintain', '后期维护方便'),
          ],
        },
        {
          id: 'b4_ideal_scene', code: 'B4', type: 'longText', required: false,
          title: '请描述您理想中的生活画面',
          description: '例如：晚上回家时，空间柔和安静，家人可以舒适地阅读和聊天。',
          placeholder: '请输入您的想法', validation: { maxLength: 300 },
        },
        {
          id: 'b5_success', code: 'B5', type: 'single', required: true,
          title: '怎样才算一次成功的灯光设计？',
          options: [
            option('comfortable', '长时间使用仍然舒适'), option('beautiful', '空间效果更高级'),
            option('easy', '控制简单易用'), option('balanced', '效果、功能与预算平衡'),
          ],
        },
      ],
    },
    {
      id: 'special',
      code: 'C',
      title: '专项需求',
      description: '结合家庭成员和生活场景确认专项需求，共 6 题',
      estimatedMinutes: 2,
      questions: [
        {
          id: 'c1_elderly', code: 'C1', type: 'single', required: true,
          title: '是否有老人长期居住？',
          options: [option('yes', '有'), option('no', '没有')],
        },
        {
          id: 'c2_elderly_needs', code: 'C2', type: 'multiple', required: true,
          title: '老人照明需要重点关注什么？',
          options: [
            option('night', '起夜照明'), option('brighter', '整体更明亮'),
            option('anti_glare', '减少眩光'), option('simple_switch', '开关简单易用'),
          ],
          validation: { minSelections: 1 },
          visibleWhen: { questionId: 'c1_elderly', operator: 'equals', value: 'yes' },
        },
        {
          id: 'c3_children', code: 'C3', type: 'single', required: true,
          title: '是否有儿童长期居住？',
          options: [option('yes', '有'), option('no', '没有')],
        },
        {
          id: 'c4_habits', code: 'C4', type: 'longText', required: false,
          title: '请补充家庭成员的生活习惯',
          description: '例如：床上阅读、夜间工作、观影、收藏展示等。',
          placeholder: '请输入生活习惯', validation: { maxLength: 300 },
        },
        {
          id: 'c5_scene_photos', code: 'C5', type: 'upload', required: false,
          title: '上传现场照片', description: '支持选择照片，本轮仅在本机预览',
          accept: 'image', validation: { maxFiles: 6 },
        },
        {
          id: 'c6_decorative', code: 'C6', type: 'multiple', required: true,
          title: '可以接受哪些装饰性灯具？',
          options: [
            option('pendant', '吊灯'), option('wall', '壁灯'), option('floor', '落地灯'),
            option('table', '台灯'), option('none', '不需要装饰灯'),
          ],
          validation: { minSelections: 1 },
        },
      ],
    },
    {
      id: 'control',
      code: 'D',
      title: '控制与预算',
      description: '确认控制方式、预算和资料条件，共 5 题',
      estimatedMinutes: 2,
      questions: [
        {
          id: 'd1_control', code: 'D1', type: 'single', required: true,
          title: '倾向哪种灯光控制方式？',
          options: [
            option('switch', '普通开关'), option('zoned', '分区控制'),
            option('dimming', '调光调色'), option('smart', '智能联动'),
          ],
        },
        {
          id: 'd2_smart_methods', code: 'D2', type: 'multiple', required: true,
          title: '希望使用哪些智能控制方式？',
          options: [
            option('panel', '场景面板'), option('voice', '语音控制'),
            option('phone', '手机控制'), option('sensor', '传感器联动'),
          ],
          validation: { minSelections: 1 },
          visibleWhen: { questionId: 'd1_control', operator: 'equals', value: 'smart' },
        },
        {
          id: 'd3_budget', code: 'D3', type: 'number', required: true,
          title: '灯光相关预算约为多少？', placeholder: '请输入预算', unit: '万元',
          validation: { min: 0.1, max: 1000 },
        },
        {
          id: 'd4_drawings', code: 'D4', type: 'upload', required: false,
          title: '上传已有项目资料', description: '可选择平面图、效果图或其他文件',
          accept: 'file', validation: { maxFiles: 5 },
        },
        {
          id: 'd5_notes', code: 'D5', type: 'shortText', required: false,
          title: '还有什么需要特别说明？', placeholder: '请输入补充说明',
          validation: { maxLength: 100 },
        },
      ],
    },
  ],
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getFormTemplate(spaceType) {
  const template = clone(FORM_TEMPLATE)
  const shortTitles = {
    A1: '项目名称', A2: '所在地', A3: '项目面积', A4: '当前阶段',
    B1: '空间氛围', B2: '设计底线', B3: '优先级排序', B4: '理想生活', B5: '成功标准',
    C1: '老人居住', C2: '老人需求', C3: '儿童居住', C4: '生活习惯', C5: '现场照片', C6: '装饰灯具',
    D1: '控制方式', D2: '智能控制', D3: '预算范围', D4: '项目资料', D5: '补充说明',
  }
  template.modules.forEach((module) => module.questions.forEach((question) => {
    question.shortTitle = shortTitles[question.code]
    if (question.type === 'upload') question.uploadType = question.accept
  }))
  template.spaceType = spaceType || 'residential'
  return template
}

module.exports = { getFormTemplate }
