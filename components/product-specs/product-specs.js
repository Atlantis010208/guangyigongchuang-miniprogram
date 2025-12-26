/**
 * 商品参数展示组件
 * 用于在商品详情页展示灯具专业参数
 * 纯文字布局，简洁清晰
 */

// 品牌映射表
const BRAND_LABELS = {
  'nvc': '雷士照明',
  'cndeon': '西顿照明',
  'philips': '飞利浦',
  'opple': '欧普照明',
  'panasonic': '松下',
  'osram': '欧司朗',
  'sansi': '三思',
  'tcl': 'TCL照明',
  'yankon': '阳光照明',
  'other': '其他',
}

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 商品数据
    product: {
      type: Object,
      value: null,
      observer: '_onProductChange'
    },
    // 分组后的规格数据 (可选，如果 product 中已包含则无需传递)
    groupedSpecs: {
      type: Object,
      value: null
    },
    // 旧版参数数组 (兼容演示数据)
    params: {
      type: Array,
      value: null,
      observer: '_onParamsChange'
    },
    // 默认是否展开
    defaultExpanded: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    hasSpecs: false,
    hasGroupedSpecs: false,
    brandLabel: ''
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      this._checkHasSpecs()
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 产品数据变化时的处理
     */
    _onProductChange(newVal) {
      if (!newVal) {
        this.setData({
          hasSpecs: false,
          hasGroupedSpecs: false,
          brandLabel: ''
        })
        this._checkHasSpecs()
        return
      }

      // 检查是否有规格数据
      const hasGroupedSpecs = this._hasGroupedSpecs(newVal.groupedFixedSpecs || this.data.groupedSpecs)
      const hasLegacySpecs = newVal.specifications && newVal.specifications.length > 0
      const hasBasicInfo = newVal.brand || newVal.model

      // 获取品牌标签
      let brandLabel = ''
      if (newVal.brand) {
        brandLabel = BRAND_LABELS[newVal.brand] || newVal.brand
        // 处理自定义品牌 (brand 为 'other' 且有 customBrand)
        if (newVal.brand === 'other' && newVal.customBrand) {
          brandLabel = newVal.customBrand
        }
      }

      this.setData({
        hasSpecs: hasGroupedSpecs || hasLegacySpecs || hasBasicInfo || (this.data.params && this.data.params.length > 0),
        hasGroupedSpecs,
        brandLabel,
        // 如果 groupedSpecs 属性未传递，使用产品中的数据
        groupedSpecs: this.data.groupedSpecs || newVal.groupedFixedSpecs || {}
      })
    },

    /**
     * params 属性变化时的处理
     */
    _onParamsChange(newVal) {
      this._checkHasSpecs()
    },

    /**
     * 检查是否有规格数据可展示
     */
    _checkHasSpecs() {
      const product = this.data.product
      const params = this.data.params
      const groupedSpecs = this.data.groupedSpecs
      
      const hasGroupedSpecs = this._hasGroupedSpecs(groupedSpecs || (product && product.groupedFixedSpecs))
      const hasLegacySpecs = product && product.specifications && product.specifications.length > 0
      const hasParams = params && params.length > 0
      const hasBasicInfo = product && (product.brand || product.model)
      
      this.setData({
        hasSpecs: hasGroupedSpecs || hasLegacySpecs || hasParams || hasBasicInfo,
        hasGroupedSpecs
      })
    },

    /**
     * 检查是否有分组规格数据
     */
    _hasGroupedSpecs(specs) {
      if (!specs || typeof specs !== 'object') return false
      
      const groups = ['optical', 'electrical', 'physical', 'functional']
      return groups.some(group => 
        specs[group] && Array.isArray(specs[group]) && specs[group].length > 0
      )
    }
  }
})

