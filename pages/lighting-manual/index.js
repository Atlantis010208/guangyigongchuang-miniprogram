Page({
  data: {
    navOpacity: 0,
    showContactSheet: false,
    // 顶部吸附式横向定位栏：在原 hero-nav-grid 滑出视口后显示
    stickyNavVisible: false,

    // 案例/评价详情弹窗
    detailVisible: false,
    detailType: '', // 'case' | 'review' | 'delivery'
    detailItem: null,
    detailSwiperIndex: 0,

    // 二哥头像（由 lighting_manual_config 云函数动态拉取）
    avatarUrl: '',
    
    // 原飞书文档数据 - 一字不落
    heroInfo: {
      title: "灯光 让家 / 有温度",
      docTitle: "灯光设计服务说明书",
      subtitle: "👋 Hi！我是“二哥”。这是我的灯光设计说明书，你可以在这里快速了解我们的服务内容、服务流程、核心竞争力。"
    },

    navButtons: [
      { text: "关于二哥", target: "about" },
      { text: "关于报价", target: "packages" },
      { text: "交付标准", target: "delivery" }, // 锚点可指回 packages
      { text: "案例口碑", target: "cases" }
    ],

    aboutInfo: {
      tags: ["10年", "2家", "1件事"],
      details: [
        "我是二哥（彭康华），生于广东汕尾、现定居广州。",
        "灯光设计讲师、灯光博主，B端做装修公司 设计公司的灯光设计讲师及顾问，C端专注为高端住宅和商业空间提供专业灯光设计、亮化工程及灯具配套。",
        "从业10年，2家公司创始人，专注于做一件事：通过专业的灯光设计让空间变得更舒适、更有氛围感。"
      ],
      contactRules: [
        "你可以看完文档后，需要购买我们的服务，在微信给我留言；",
        "重要事情找我沟通，请把问题罗列清楚后，沟通会更加高效；",
        "如果未及时回复你，我可能我正在会议中，我将在会议结束后回复你的消息；",
        "微信 17728117703，备用微信 17728117010，欢迎有任何问题都可以找我谈。"
      ]
    },

    philosophy: [
      "不做传统、没有灵魂的设计，每一套方案都是根据客户的需求定制的设计；",
      "拥有规范的设计流程、严格的审核机制，保障每一份设计方案的交付；",
      "感受为王 —— 设计从用户的真实体验出发，而非样板间的炫技；",
      "理性美学 —— 用逻辑和系统打造可以落地的高级感；",
      "解决问题 —— 不止是“好看”，而是“让生活更轻松”；",
      "以终为始 —— 所有设计从结果出发，服务生活而非干扰生活；",
      "不断迭代 —— 每一个细节都值得反复打磨，直到它“刚刚好”；"
    ],

    promises: [
      { icon: "/images/顾问.png", title: "私人顾问", desc: "灯光行业头部博主作为你的私人顾问，拥有最新最前沿的设计理念；" },
      { icon: "/images/跟进人.png", title: "全程陪跑", desc: "全程陪跑式灯光落地服务，从概念到施工全程跟进，有任何问题及时处理；" },
      { icon: "/images/赠品包.png", title: "专属赠品", desc: "赠送一套¥399购买的「装修最全流程与8大阶段避坑资料包」；" },
      { icon: "/images/社群.png", title: "大咖社群", desc: "专属高端“装修避坑交流”社群，各路大佬10年以上经验的专家解答问题（软装设计师、定制设计师、墙面专家、智能家居专家...）帮你随时解答装修疑问及棘手问题；" }
    ],

    timeline: [
      { step: "第一步", title: "初次接触", desc: "了解并确定合作意向" },
      { step: "第二步", title: "设计执行阶段", desc: "现场信息收集 + 图纸制作 + 生活习惯调研" },
      { step: "第三步", title: "灯具选型阶段", desc: "认证匹配 + 样品确认 + 核对清单" },
      { step: "第四步", title: "备品机制阶段", desc: "10%备货比例 + 同批次光源控制" },
      { step: "第五步", title: "生产&发货阶段", desc: "编号打包 + 清单复核 + 预留时间" },
      { step: "第六步", title: "安装执行阶段", desc: "图纸对应 + 可视化编号 + 指引交底" },
      { step: "第七步", title: "突发问题处理阶段", desc: "救场机制 + 应急渠道 + 技术支持" }
    ],

    // 由云函数 lighting_cases_list / lighting_reviews_list 填充
    casesData: [],
    reviewsData: [],

    teamFlow: [
      { title: "合作开始\n<付款节点>", desc: "确定合作>抵扣券抵扣设计费>收设计定金50%\n建立专属服务群>邀请入装修社群", time: "初次接触沟通" },
      { title: "第一阶段", desc: "2天内完成", time: "照度色温规划" },
      { title: "第二阶段", desc: "预计7天内完成", time: "初步灯光方案" },
      { title: "第三阶段\n<付款节点>", desc: "付50%设计尾款后\n预计7天内完成深化", time: "深化施工图设计" },
      { title: "第四阶段", desc: "预计5天内完成", time: "灯具选型报价" }
    ],

    teamPackages: [
      {
        name: "标准灯光设计",
        price: "¥39/㎡",
        features: [
          { text: "初步概念方案设计", included: true },
          { text: "3D效果图（不含）", included: false },
          { text: "全套深化施工图", included: true },
          { text: "灯具选型预算表", included: true },
          { text: "全过程跟进服务", included: true }
        ],
        cycle: "7 - 12天（含2次修改）",
        offer: "本月前10名下单送《399装修全流程指南》（剩余2个名额）",
        delivery: "点击直接跳转交付标准",
        audience: "住宅空间，对灯光有要求，不要求看效果图也可以的人。"
      },
      {
        name: "高级灯光设计",
        price: "¥69/㎡",
        isPopular: true,
        features: [
          { text: "灯光概念方案设计", included: true },
          { text: "3D效果图", included: true },
          { text: "全套深化施工图", included: true },
          { text: "灯具选型预算表", included: true },
          { text: "全过程跟进服务", included: true }
        ],
        cycle: "10 - 15天（含3次修改）",
        offer: "赠送灯具采购渠道价服务（省20%成本）",
        delivery: "点击直接跳转交付标准",
        audience: "住宅空间，对灯光有要求，且一定要看到设计的灯光效果的人。"
      },
      {
        name: "全屋智能+灯光设计",
        price: "¥59/㎡",
        twoColumn: true,
        features: [
          { text: "灯光概念方案设计", included: true },
          { text: "3D效果图（不含）", included: false },
          { text: "全套深化施工图", included: true },
          { text: "灯具选型预算表", included: true },
          { text: "全过程跟进服务", included: true },
          { text: "智能遮阳系统", included: true },
          { text: "智能控制系统", included: true },
          { text: "智能传感系统", included: true },
          { text: "背景音乐系统", included: true },
          { text: "暖通控制系统", included: true },
          { text: "监控网络系统", included: true }
        ],
        cycle: "10-15天（含2次修改）",
        offer: "本月前10名下单送《399装修全流程指南》（剩余2个名额）",
        delivery: "点击直接跳转交付标准",
        audience: "住宅空间，对灯光有要求，不要求看效果图也可以的人。"
      },
      {
        name: "大型商业灯光设计",
        price: "10-100/㎡",
        features: [
          { text: "灯光概念方案设计", included: true },
          { text: "灯光模拟", included: true },
          { text: "全套深化施工图", included: true },
          { text: "灯具选型预算表", included: true },
          { text: "全过程跟进服务", included: true }
        ],
        cycle: "根据项目情况",
        offer: "无",
        delivery: "点击直接跳转交付标准",
        audience: "商业空间、酒店民宿、商业体灯光设计等等"
      }
    ],

    // 由云函数 lighting_delivery_list 填充
    deliveryStandards: [],

    // 线上服务各阶段执行（检查表）数据
    serviceChecklist: [
      {
        id: 1,
        phase: '客户初洽阶段',
        todos: [
          '获取室内图纸（CAD+PDF）',
          '获取室内照片',
          '了解使用需求与生活习惯',
          '收集建筑/电气法规（如澳洲认证标准）'
        ],
        notices: [
          '图纸单位是否统一（mm/inch）',
          '信息是否全面',
          '生活需求是否覆盖全部场景（如阅读、聚会、烹饪等）'
        ],
        checks: [
          '图纸单位换算无误',
          '空间照片清晰完整',
          '使用需求文档化'
        ]
      },
      {
        id: 2,
        phase: '设计进行阶段',
        todos: [
          '灯光概念制定',
          '空间逐点位设计',
          '与客户反复确认设计逻辑'
        ],
        notices: [
          '语言沟通是否有误解',
          '时间差影响沟通频率',
          '是否考虑本地材料与安装环境'
        ],
        checks: [
          '所有回路/点位/灯型明确',
          '客户确认设计逻辑无误',
          '设计图/施工图交付'
        ]
      },
      {
        id: 3,
        phase: '灯具选型阶段',
        todos: [
          '根据图纸完成灯具选型表',
          '匹配认证（如SAA、CE）',
          '每款先出样确认'
        ],
        notices: [
          '样品是否按设计规格打样',
          '色温/配光/接口/驱动是否一致',
          '是否有清晰选型编号'
        ],
        checks: [
          '客户确认样品无误',
          '编号系统建立完毕',
          '全部灯具符合认证'
        ]
      },
      {
        id: 4,
        phase: '灯具备品机制',
        todos: [
          '灯体、驱动、转接器、光源等备用配件配齐',
          '按10%-15%数量比例准备'
        ],
        notices: [
          '是否与主灯具同一批次（避免色差）',
          '是否包装清晰并有编号'
        ],
        checks: [
          '备用灯具清单完整',
          '发货时与主货物一起运输',
          '客户知晓备用方案'
        ]
      },
      {
        id: 5,
        phase: '灯具产发阶段',
        todos: [
          '确认下单前清单+参数表',
          '工厂每款灯具编号对应图纸',
          '每一批打包标记清晰'
        ],
        notices: [
          '编号是否与图纸完全匹配',
          '是否标清"备用灯具"',
          '是否与物流公司确认运输周期'
        ],
        checks: [
          '清单与图纸100%核对',
          '灯具打包编号齐全',
          '发货时间留足10-20天缓冲'
        ]
      },
      {
        id: 6,
        phase: '灯具安装阶段',
        todos: [
          '灯具布置图、编号表、安装指引打包给电工',
          '视频交底，确保理解每个编号对应位置'
        ],
        notices: [
          '不依赖人工记忆',
          '图纸版本与施工图一致',
          '灯具是否有误差替代方案'
        ],
        checks: [
          '安装师傅能凭图上手',
          '关键节点拍照反馈',
          '每类灯具安装反馈确认'
        ]
      },
      {
        id: 7,
        phase: '突发问题处理',
        todos: [
          '应对客户自购产品不合规（如驱动不防水）',
          '现场突发事件或灯具有安装及售后问题',
          '启动应急资源寻找解决方案'
        ],
        notices: [
          '是否快速响应',
          '是否具备替代方案资源',
          '是否节省客户时间精力'
        ],
        checks: [
          '问题解决及时',
          '替代品合规并交付',
          '客户有正向反馈'
        ]
      }
    ],

    platformFlow: [
      { title: "第一阶段\n<付款节点>", desc: "1.收到用户设计需求；\n2.匹配共创设计师；\n3.确定合作收取50%设计定金", time: "发布设计需求" },
      { title: "第二阶段", desc: "1.收集客户个性需求；\n2.开始设计，用户反馈沟通，线上回应调整建议；\n3.最终确定初稿，提交平台审核。", time: "共创设计阶段" },
      { title: "第三阶段", desc: "1.交初步设计稿，审核方案；\n2.初稿交付，进行沟通并调整。", time: "平台审核方案" },
      { title: "第四阶段\n<付款节点>", desc: "1.交付尾款进入“施工图设计”\n2.交付施工图，内部审核通过后，交付给客户。", time: "施工图深化设计" },
      { title: "第五阶段", desc: "1.根据规范上传设计档案；\n2.存档方便调取及调整。", time: "上传设计资料" },
      { title: "第六阶段", desc: "1.提供1-2份灯具品牌的报价；\n2.在施工过程全程有问题及时跟进，至项目落地。", time: "后期项目跟进" }
    ],

    platformPackages: [
      {
        name: "选灯配灯服务",
        price: "¥5/㎡",
        features: [
          { text: "灯具布置图", included: true },
          { text: "灯具参数表", included: true },
          { text: "灯具选型预算表", included: true }
        ],
        cycle: "2-5天（含2次修改）",
        delivery: "交付PDF文件",
        audience: ""
      },
      {
        name: "全套灯光设计",
        price: "¥9-50/㎡",
        features: [
          { text: "灯光概念方案设计", included: true },
          { text: "全套深化施工图", included: true },
          { text: "灯具选型预算表", included: true },
          { text: "全过程跟进服务", included: true }
        ],
        cycle: "5 - 15天（含3次修改）",
        delivery: "根据预算匹配设计师，不同设计师交付文件有轻微差异。",
        audience: ""
      }
    ]
  },

  onLoad() {
    this.setupIntersectionObserver();
    this.loadContent();
  },

  onReady() {
    // 等首屏渲染完成后测量 hero-nav-grid 底部位置（基于 onPageScroll 阈值显示 sticky-nav）
    this.measureHeroNavBottom();
  },

  onResize() {
    this.measureHeroNavBottom();
  },

  /**
   * 测量 .hero-nav-grid 在页面中的底部位置（page Y 坐标）
   * 用于 onPageScroll 中判断是否需要显示顶部吸附式定位栏
   */
  measureHeroNavBottom(retry = 0) {
    // 注意：Page 中不能使用 .in(this)，那是自定义组件的 API
    const query = wx.createSelectorQuery();
    query.select('.hero-nav-grid').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec((res) => {
      const rect = res && res[0];
      const scroll = (res && res[1]) || { scrollTop: 0 };
      if (!rect) {
        // hero-nav-grid 还未渲染，最多重试 5 次
        if (retry < 5) {
          setTimeout(() => this.measureHeroNavBottom(retry + 1), 200);
        } else {
          console.warn('[lighting-manual] 测量 hero-nav-grid 失败，sticky-nav 将永远隐藏');
        }
        return;
      }
      // boundingClientRect 是基于视口的，加上当前 scrollTop 即为页面绝对 Y
      this._heroNavBottomY = rect.bottom + scroll.scrollTop;
      console.log('[lighting-manual] heroNavBottomY =', this._heroNavBottomY);
      // 立刻基于当前 scrollTop 判定一次状态
      this.updateStickyNavVisible(scroll.scrollTop);
    });
  },

  updateStickyNavVisible(scrollTop) {
    if (typeof this._heroNavBottomY !== 'number') return;
    // 当前页面顶部下方 88px (≈ nav-bar 1/2 高度) 越过 hero-nav-grid 底部即显示
    const threshold = this._heroNavBottomY - 88;
    const visible = scrollTop > threshold;
    if (this.data.stickyNavVisible !== visible) {
      this.setData({ stickyNavVisible: visible });
    }
  },

  async loadContent() {
    try {
      const [casesRes, reviewsRes, deliveryRes, configRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'lighting_cases_list', data: { limit: 20 } }),
        wx.cloud.callFunction({ name: 'lighting_reviews_list', data: { limit: 20 } }),
        wx.cloud.callFunction({ name: 'lighting_delivery_list', data: { limit: 50 } }),
        wx.cloud.callFunction({ name: 'lighting_manual_config', data: { action: 'get' } })
      ]);

      const casesData = (casesRes && casesRes.result && casesRes.result.data && casesRes.result.data.items) || [];
      const reviewsData = (reviewsRes && reviewsRes.result && reviewsRes.result.data && reviewsRes.result.data.items) || [];
      const deliveryItems = (deliveryRes && deliveryRes.result && deliveryRes.result.data && deliveryRes.result.data.items) || [];
      const avatarUrl = (configRes && configRes.result && configRes.result.data && configRes.result.data.avatarUrl) || '';

      this.setData({ casesData, reviewsData, deliveryStandards: deliveryItems, avatarUrl });
    } catch (e) {
      console.error('[lighting-manual] 加载数据失败', e);
    }
  },

  onPreviewImage(e) {
    const { urls, current } = e.currentTarget.dataset;
    if (!urls || !urls.length) return;
    wx.previewImage({ urls, current: current || urls[0] });
  },

  // 跳转公众号文章（wx.openOfficialAccountArticle）
  onOpenOfficialArticle(e) {
    const { url } = e.currentTarget.dataset;
    if (!url) return;
    if (!wx.canIUse || !wx.canIUse('openOfficialAccountArticle')) {
      wx.showToast({ title: '当前微信版本过低', icon: 'none' });
      return;
    }
    wx.openOfficialAccountArticle({
      url,
      fail: (err) => {
        console.error('[lighting-manual] 跳转公众号文章失败', err);
        wx.showToast({
          title: (err && err.errMsg) ? '跳转失败，请检查公众号关联' : '跳转失败，请稍后重试',
          icon: 'none',
          duration: 2000,
        });
      },
    });
  },

  // 打开详情弹窗
  onShowDetail(e) {
    const { type, index } = e.currentTarget.dataset;
    let list;
    if (type === 'case') list = this.data.casesData;
    else if (type === 'review') list = this.data.reviewsData;
    else if (type === 'delivery') list = this.data.deliveryStandards;
    const item = list && list[index];
    if (!item) return;
    this.setData({
      detailVisible: true,
      detailType: type,
      detailItem: item,
      detailSwiperIndex: 0,
    });
  },

  // 关闭详情弹窗
  onHideDetail() {
    this.setData({
      detailVisible: false,
      detailItem: null,
      detailSwiperIndex: 0,
    });
  },

  // 阻止弹窗内容区冒泡到遮罩
  noop() {},

  // swiper 切换更新索引
  onDetailSwiperChange(e) {
    this.setData({ detailSwiperIndex: e.detail.current });
  },

  // 点击详情图片放大预览
  onDetailPreviewImage(e) {
    const { url } = e.currentTarget.dataset;
    const urls = this.data.detailItem && this.data.detailItem.imageUrls;
    if (!urls || !urls.length) return;
    wx.previewImage({ urls, current: url || urls[0] });
  },

  onPageScroll(e) {
    // 顶部吸附式横向定位栏显示控制
    this.updateStickyNavVisible(e.scrollTop);

    let opacity = e.scrollTop / 100;
    if (opacity > 1) opacity = 1;
    if (opacity < 0) opacity = 0;
    
    // 只在透明度变化较大时更新以优化性能
    if (Math.abs(this.data.navOpacity - opacity) > 0.05) {
      this.setData({ navOpacity: opacity });
    }
  },

  // 监听元素进入视口，触发淡入动效
  setupIntersectionObserver() {
    const observer = this.createIntersectionObserver({ observeAll: true });
    observer.relativeToViewport({ bottom: 0 }).observe('.fade-up', (res) => {
      if (res.intersectionRatio > 0) {
        // 由于是多个元素，使用 selectComponent/selectOwnerComponent 会很麻烦，
        // 在原生小程序中，可以通过改变 className 或直接使用 dataset 来改变状态，
        // 这里采用在 wxml 中直接使用 wx:if 或绑定 id，但更推荐简单做法：
        // 赋予样式让 CSS 自行处理
      }
    });
  },

  navigateBack() {
    wx.navigateBack({ delta: 1 });
  },

  /**
   * 双击导航栏返回顶部（300ms 内两次点击视为双击）
   */
  onNavBarTap() {
    const now = Date.now();
    const last = this._lastNavTapTime || 0;
    if (now - last < 300) {
      // 双击命中，回顶并轻震动反馈
      this._lastNavTapTime = 0;
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
    } else {
      this._lastNavTapTime = now;
    }
  },

  scrollTo(e) {
    const target = e.currentTarget.dataset.target;
    wx.pageScrollTo({
      selector: `#${target}`,
      duration: 300,
      offsetTop: -80 // 留出顶部导航栏的空间
    });
  },

  showContact() {
    this.setData({ showContactSheet: true });
  },

  hideContact() {
    this.setData({ showContactSheet: false });
  },

  copyWechat() {
    wx.setClipboardData({
      data: '17728117703',
      success: () => {
        wx.showToast({ title: '微信号已复制', icon: 'success' });
        this.hideContact();
      }
    });
  }
})
