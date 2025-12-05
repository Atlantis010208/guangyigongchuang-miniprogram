const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    mode: '',
    // 表单题目（按顺序）
    questions: [],
    submitting:false
  },
  onLoad({id}){
    // 第二个卡片改为表单模式；第一个卡片复刻发布需求界面
    if (id === 'photo') { this.setData({ mode:'form', questions: this.buildQuestions() }); return }
    // 第一张卡片恢复到「上次的问卷」并独立存在
    if (id === 'video') { this.setData({ mode:'form', questions: this.buildLegacyQuestions() }); return }

    // 其余保留默认（如将来拓展其他模式）
  },
  // 第二张卡片（个性需求定制）题目
  buildQuestions(){
    // 根据截图重构问卷（精选必填/多选/单选项）
    return [
      { key:'age', title:'你的年龄为', type:'radio', options:[
        {label:'30岁以下', value:'30岁以下'}, {label:'30-40岁', value:'30-40岁'}, {label:'40-50岁', value:'40-50岁'}, {label:'50岁以上', value:'50岁以上'}
      ]},
      { key:'family', title:'长住人员结构、年龄及对应居住空间位置', type:'input' },
      { key:'budgetTotal', title:'整体装修预算', type:'radio', options:[
        {label:'20万以内', value:'20万以内'},{label:'30万以内', value:'30万以内'},{label:'40万以内', value:'40万以内'},{label:'50万以内', value:'50万以内'},{label:'80万以内', value:'80万以内'},{label:'100万以内', value:'100万以内'},{label:'其他', value:'other'}
      ]},
      { key:'style', title:'风格意向', type:'radio', options:[
        {label:'意式极简', value:'意式极简'},{label:'现代极简', value:'现代极简'},{label:'原木风', value:'原木风'},{label:'奶油风', value:'奶油风'},{label:'中古风', value:'中古风'},{label:'宋史美学', value:'宋史美学'},{label:'轻法式', value:'轻法式'},{label:'新中式', value:'新中式'},{label:'轻奢风', value:'轻奢风'},{label:'侘寂风', value:'侘寂风'},{label:'美式风', value:'美式风'},{label:'其他', value:'other'}
      ]},
      { key:'renoType', title:'装修类型', type:'radio', options:[
        {label:'精装房', value:'精装房'},{label:'毛坯房', value:'毛坯房'},{label:'旧房改造', value:'旧房改造'}
      ]},
      { key:'progress', title:'装修进度', type:'radio', options:[
        {label:'未开工', value:'未开工'},{label:'走水电', value:'走水电'},{label:'木工已完工', value:'木工已完工'},{label:'油漆完工', value:'油漆完工'},{label:'硬装已完工', value:'硬装已完工'},{label:'其他', value:'other'}
      ]},
      { key:'layout', title:'平面布置', type:'radio', options:[
        {label:'已确定', value:'已确定'},{label:'还有局部要调整', value:'还有局部要调整'},{label:'其他', value:'other'}
      ]},
      { key:'area', title:'套内面积', type:'input' },
      { key:'cctPreference', title:'色温特殊要求', type:'input', subtitle:'如：楼层统一一种色温、不喜欢太黄、可接受混和色温等' },
      { key:'hvacType', title:'空调类型', type:'checkbox', options:[
        {label:'中央空调', value:'中央空调'},{label:'风管机', value:'风管机'},{label:'挂机', value:'挂机'},{label:'柜机', value:'柜机'},{label:'以图纸为准', value:'以图纸为准'},{label:'其他', value:'other'}
      ]},
      { key:'hobby', title:'兴趣爱好（需要展示的）', type:'input' },
      { key:'decorLights', title:'可接受的装饰灯', type:'checkbox', options:[
        {label:'壁灯', value:'壁灯'},{label:'吊灯', value:'吊灯'},{label:'落地灯', value:'落地灯'},{label:'台灯', value:'台灯'},{label:'其他', value:'other'}
      ]},
      { key:'cabinetStrips', title:'柜体灯带', type:'checkbox', options:[
        {label:'橱柜', value:'橱柜'},{label:'储物柜', value:'储物柜'},{label:'餐边柜', value:'餐边柜'},{label:'其他', value:'other'}
      ]},
      { key:'dryingRack', title:'晾衣架是否自带光源', type:'radio', options:[
        {label:'是', value:'是'},{label:'否', value:'否'},{label:'其他', value:'other'}
      ]},
      { key:'barLight', title:'吧台能否添加光源', type:'radio', options:[
        {label:'可添加光源', value:'可添加光源'},{label:'不添加光源', value:'不添加光源'}
      ]},
      { key:'readyCabinets', title:'有成品柜吗？', type:'checkbox', options:[
        {label:'没有', value:'没有'},{label:'其他', value:'other'}
      ]},
      { key:'bedside', title:'[多选]卧室床头', type:'checkbox', subtitle:'床头柜照明偏向吊灯、台灯还是壁灯？', options:[
        {label:'吊灯', value:'吊灯'},{label:'壁灯', value:'壁灯'},{label:'台灯', value:'台灯'},{label:'无特殊喜好', value:'无特殊喜好'},{label:'其他', value:'other'}
      ]},
      { key:'beforeSleep', title:'睡前习惯', type:'radio', options:[
        {label:'有，需要一定光源', value:'有，需要一定光源'},{label:'不需要', value:'不需要'},{label:'其他', value:'other'}
      ]},
      { key:'bathHeater', title:'浴霸', type:'checkbox', subtitle:'浴霸自带光源吗？', options:[
        {label:'自带光源', value:'自带光源'},{label:'没有光源', value:'没有光源'},{label:'没有浴霸', value:'没有浴霸'}
      ]},
      { key:'bathCeiling', title:'[多选]卫生间吊顶', type:'checkbox', options:[
        {label:'可以改', value:'可以改'},{label:'局部改', value:'局部改'},{label:'不可以改', value:'不可以改'},{label:'其他', value:'other'}
      ]},
      { key:'lightingPriority', title:'[多选]灯光优先级', type:'checkbox', subtitle:'在你心里关注点，可在其他项备注排序', options:[
        {label:'1.想要空间很亮', value:'想要空间很亮'},{label:'2.高级氛围感', value:'高级氛围感'},{label:'3.温馨的灯光', value:'温馨的灯光'},{label:'4.不要太亮', value:'不要太亮'},{label:'5.智能灯光', value:'智能灯光'},{label:'6.护眼减疲劳', value:'护眼减疲劳'},{label:'其他', value:'other'}
      ]},
      { key:'specialFavorites', title:'特殊喜好品', type:'radio', options:[
        {label:'没有', value:'没有'},{label:'其他', value:'other'}
      ]},
      { key:'dislikes', title:'[多选]不喜欢的灯', type:'checkbox', options:[
        {label:'吊灯', value:'吊灯'},{label:'壁灯', value:'壁灯'},{label:'射灯', value:'射灯'},{label:'灯带', value:'灯带'},{label:'台灯', value:'台灯'},{label:'落地灯', value:'落地灯'},{label:'磁吸灯', value:'磁吸灯'},{label:'线性灯', value:'线性灯'},{label:'吸顶灯', value:'吸顶灯'},{label:'不清楚', value:'不清楚'},{label:'其他', value:'other'}
      ]},
      { key:'diningPendant', title:'[多选]餐吊灯', type:'checkbox', subtitle:'餐桌可以接受使用吊灯吗？', options:[
        {label:'接受', value:'接受'},{label:'不接受', value:'不接受'},{label:'其他', value:'other'}
      ]},
      { key:'smartHome', title:'是否做智能家居', type:'radio', options:[
        {label:'确定做', value:'确定做'},{label:'确定不做', value:'确定不做'},{label:'还没考虑好', value:'还没考虑好'},{label:'其他', value:'other'}
      ]},
      { key:'smartLighting', title:'智能灯光倾向', type:'radio', options:[
        {label:'全屋调光调色', value:'全屋调光调色'},{label:'做单色不调光', value:'做单色不调光'},{label:'部分空间调光调色', value:'部分空间调光调色'},{label:'其他', value:'other'}
      ]},
      { key:'ceilingAdjust', title:'[多选]天花调整', type:'checkbox', subtitle:'可在其他项中填写天花可调整的位置', options:[
        {label:'可以改', value:'可以改'},{label:'局部改', value:'局部改'},{label:'不可以改', value:'不可以改'},{label:'其他', value:'other'}
      ]}
    ]
  },
  // 第一张卡片（上次的问卷）题目
  buildLegacyQuestions(){
    return [
      { key:'space', title:'空间类型', type:'radio', options:[
        {label:'住宅', value:'住宅'}, {label:'商铺', value:'商铺'}, {label:'办公室', value:'办公室'}, {label:'其他', value:'other'}
      ]},
      { key:'service', title:'需要什么服务？', type:'radio', subtitle:'根据个人需求选择', options:[
        {label:'选灯配灯服务', value:'选灯配灯服务'}, {label:'只深化灯光施工图', value:'只深化灯光施工图'}, {label:'整套灯光设计', value:'整套灯光设计'}
      ]},
      { key:'budget', title:'设计预算', type:'radio', subtitle:'基于方案复杂程度与面积的设计单价，最低价不低于每平 5 元，顶级主创/首席设计师参与交付会提高单价', options:[
        {label:'¥5/m²（只针对选灯配灯）', value:'¥5/m²（只针对选灯配灯）'},
        {label:'¥9/m²', value:'¥9/m²'},
        {label:'¥16/m²', value:'¥16/m²'},
        {label:'¥19/m²', value:'¥19/m²'},
        {label:'¥29/m²', value:'¥29/m²'},
        {label:'¥39/m²', value:'¥39/m²'},
        {label:'¥50/m²及以上', value:'¥50/m²及以上'},
        {label:'其他', value:'other'}
      ]},
      { key:'area', title:'设计面积', type:'input', subtitle:'请输入数字，低于50㎡按50㎡计费' },
      { key:'stage', title:'项目进度', type:'radio', options:[
        {label:'未开工', value:'未开工'}, {label:'正在设计', value:'正在设计'}, {label:'装修中', value:'装修中'}, {label:'已完成验收', value:'已完成验收'}
      ]},
      { key:'share', title:'愿意分享你家的装修软装预算明细吗？', type:'radio', options:[
        {label:'愿意', value:'愿意'}, {label:'不愿意', value:'不愿意'}
      ]},
      { key:'coCreate', title:'愿意跟设计师共同创作你家的设计吗？', type:'radio', options:[
        {label:'愿意', value:'愿意'}, {label:'不愿意', value:'不愿意'}
      ]},
      { key:'contact', title:'联系方式', type:'input', subtitle:'请填写电话/微信等，便于沟通' },
      { key:'accept', title:'设计流程/标准能接受吗？', type:'radio', subtitle:'(1) 核实你的装修需求，全面梳理设计阶段需求；\n(2) 按实际需求在平台内完成下单并沟通；\n(3) 收取设计费的50%定金，开始深化设计；\n(4) 交付成套设计方案，平台审核通过后交付给用户；\n(5) 后续…', options:[
        {label:'接受', value:'接受'}, {label:'不接受', value:'不接受'}, {label:'其他', value:'other'}
      ]}
    ]
  },
  onRadioChange(e){
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({ [key]: value })
  },
  onCheckboxChange(e){
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value })
  },
  onOtherInput(e){
    const key = e.currentTarget.dataset.key
    this.setData({ [key + '_other']: e.detail.value })
  },
  onOtherInputMulti(e){
    const key = e.currentTarget.dataset.key
    this.setData({ [key + '_other']: e.detail.value })
  },
  onInputChange(e){
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value })
  },
  async onSubmit(){
    if (this.data.submitting || this._submitting) return
    // 所有表单模式（两个卡片都可能进入 form）统一处理为方案订单
    if (this.data.mode === 'form') {
      try{
        const id = Date.now().toString()
        this._submitting = true
        this.setData({ submitting:true })
        const params = {}
        ;(this.data.questions||[]).forEach(q=>{
          const key = q && q.key
          if(!key) return
          const otherKey = key + '_other'
          let val = this.data[key]
          if (Array.isArray(val)) val = val.slice()
          if (this.data[otherKey]) params[otherKey] = this.data[otherKey]
          if (typeof val !== 'undefined') params[key] = val
        })
        
        try{
          const db = api.dbInit()
          if (db) {
            const userDoc = wx.getStorageSync('userDoc') || {}
            const userId = (userDoc && userDoc._id) ? userDoc._id : null
            try{
              console.log('[提交个性需求] 调用 requests_create, userId:', userId, 'orderNo:', id)
              const r1 = await util.callCf('requests_create', { request: { orderNo: id, category: 'custom', params, userId, status: 'submitted' } })
              console.log('[提交个性需求] requests_create 返回:', r1)
              if (!r1 || !r1.success) {
                console.warn('[提交个性需求] 云函数失败，尝试直接写入')
                // 云函数失败时，直接用客户端写入作为兜底
                const Requests = api.getRequestsRepo(db)
                await Requests.create({ orderNo: id, category: 'custom', params, userId, status: 'submitted' })
                console.log('[提交个性需求] 直接写入成功')
              }
            }catch(err){
              console.error('[提交个性需求] requests_create 失败:', err)
              const msg = (err && (err.message || err.errMsg)) || ''
              if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
                console.log('[提交个性需求] 集合不存在，尝试创建...')
                if (wx.cloud && wx.cloud.callFunction) {
                  await wx.cloud.callFunction({ name: 'initCollections' }).catch((e)=>console.error('initCollections失败:', e))
                  const r2 = await util.callCf('requests_create', { request: { orderNo: id, category: 'custom', params, userId, status: 'submitted' } })
                  console.log('[提交个性需求] 重试 requests_create 返回:', r2)
                }
              } else {
                // 未知错误时，尝试直接写入
                console.warn('[提交个性需求] 尝试直接写入作为兜底')
                try {
                  const Requests = api.getRequestsRepo(db)
                  await Requests.create({ orderNo: id, category: 'custom', params, userId, status: 'submitted' })
                  console.log('[提交个性需求] 直接写入成功')
                } catch (e2) {
                  console.error('[提交个性需求] 直接写入也失败:', e2)
                }
              }
            }
            console.log('[提交个性需求] 调用 orders_create, userId:', userId, 'orderNo:', id)
            util.callCf('orders_create', { order: { type:'products', orderNo:id, category:'custom', params, status:'submitted', paid:false, userId } })
              .then(r => console.log('[提交个性需求] orders_create 返回:', r))
              .catch(e => console.error('[提交个性需求] orders_create 失败:', e))
          }
        }catch(err){}
        wx.showToast({ title:'已提交', icon:'success' })
        setTimeout(()=>{ wx.switchTab({ url:'/pages/cart/cart' }); this._submitting = false; this.setData({ submitting:false }) }, 500)
      }catch(err){ wx.showToast({ title:'提交失败，请重试', icon:'none' }) }
      return
    }
    // 兜底：其他模式（当前未使用）
    wx.showToast({ title:'已提交', icon:'success' })
  },
  goCourses(){ wx.navigateTo({ url: '/pages/explore/courses/courses' }) },
  register(){ wx.showToast({ title:'已报名', icon:'success' }) },
  // 发布模式交互（复用发布页字段名）
  onSpaceChange(e){ this.setData({ space:e.detail.value }) },
  onSpaceOther(e){ this.setData({ spaceOther:e.detail.value }) },
  onServiceChange(e){ this.setData({ service:e.detail.value }) },
  onBudgetChange(e){ this.setData({ budget:e.detail.value }) },
  onBudgetOther(e){ this.setData({ budgetOther:e.detail.value }) },
  onArea(e){ this.setData({ area:e.detail.value }) },
  onStageChange(e){ this.setData({ stage:e.detail.value }) },
  onShareChange(e){ this.setData({ share:e.detail.value }) },
  onCoCreateChange(e){ this.setData({ coCreate:e.detail.value }) },
  onContact(e){ this.setData({ contact:e.detail.value }) },
  // 仅供“发布模式”使用，避免和表单模式的提交冲突
  onPublishSubmit(){
    if(!this.data.space){ wx.showToast({ title:'请选择空间类型', icon:'none' }); return }
    if(!this.data.service){ wx.showToast({ title:'请选择服务类型', icon:'none' }); return }
    if(!this.data.budget){ wx.showToast({ title:'请选择预算', icon:'none' }); return }
    if(!this.data.area){ wx.showToast({ title:'请输入设计面积', icon:'none' }); return }
    if(!this.data.stage){ wx.showToast({ title:'请选择项目进度', icon:'none' }); return }
    if(!this.data.contact){ wx.showToast({ title:'请填写联系方式', icon:'none' }); return }
    wx.showToast({ title:'已提交', icon:'success' })
  },
  openRecommend(){
    this.onLoad({ id:'photo' })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  }
})
