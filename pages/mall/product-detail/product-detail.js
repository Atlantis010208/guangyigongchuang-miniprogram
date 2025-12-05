// pages/mall/product-detail/product-detail.js
Page({
  data: {
    id: '',
    name: '商品名称',
    price: 0,
    images: [
      'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
      'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'
    ],
    desc: '以简约设计还原真实光影，显指高、眩光低，适配多种空间。',
    params: [
      { key: '色温', value: '3000K / 4000K 可选' },
      { key: '显色指数', value: 'Ra ≥ 90' },
      { key: '功率', value: '24W / 36W' },
      { key: '材质', value: '铝合金 + PMMA' }
    ],
    variantGroups: [],
    selectedVariants: {},
    quantity: 1,
    fav: false
  },

  onLoad(query) {
    const { id } = query || {}
    // 简单占位：根据 id 填充演示数据
    let name = '商品名称', price = 0
    if (id === 'p1') { name = '极简吸顶灯 40cm'; price = 399 }
    if (id === 'p2') { name = '观月组合 5+6'; price = 1820 }
    if (id === 'p3') { name = '轨道射灯 12W'; price = 129 }
    if (id === 'p4') { name = '磁吸灯套装'; price = 899 }
    if (id === 'p5') { name = '智能筒灯 10W'; price = 89 }
    if (id === 'p6') { name = '线型吊灯 1.2m'; price = 599 }
    if (id === 'p7') { name = '床头壁灯'; price = 219 }
    if (id === 'p8') { name = '庭院草坪灯'; price = 159 }
    if (id === 'p9') { name = '落地阅读灯'; price = 329 }
    if (id === 'p10') { name = '氛围灯带 5m'; price = 199 }
    if (id === 'p11') { name = '厨房橱柜灯'; price = 149 }
    if (id === 'p12') { name = '镜前灯 9W'; price = 189 }
    const meta = this.getProductMetaById(id)
    this.setData({ id, name, price, images: meta.images, desc: meta.desc })
    this.syncFavState()
    // 初始化规格配置与默认选择
    const cfg = this.getSkuConfigByProductId(id)
    const defaults = {}
    ;(cfg.variantGroups || []).forEach(g => { defaults[g.key] = g.options[0] })
    const enriched = this.enrichVariantGroups(cfg.variantGroups || [], defaults)
    this.setData({ variantGroups: enriched, selectedVariants: defaults }, () => {
      this.recalcPrices()
      this.recalcParams()
    })
  },

  onShow(){
    this.syncFavState()
  },

  syncFavState(){
    try{
      const list = wx.getStorageSync('mall_favorites') || []
      const exists = (list || []).some(i => i.id === this.data.id)
      if (exists !== this.data.fav) this.setData({ fav: exists })
    }catch(e){}
  },

  getSkuConfigByProductId(id){
    // 定义每个商品的规格项与定价规则
    switch(id){
      case 'p1': // 极简吸顶灯
        return {
          variantGroups: [
            { key: 'size', name: '尺寸', options: ['40cm', '50cm', '60cm', '70cm'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '3500K', '4000K', '5000K'] },
            { key: 'dimming', name: '调光', options: ['无', '三段调光', '无极调光', '蓝牙Mesh'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色', '灰色', '香槟金'] }
          ],
          getUnitPrice: (sel)=>{
            // 基础价按尺寸
            const baseMap = { '40cm': 399, '50cm': 549, '60cm': 699, '70cm': 899 }
            const base = baseMap[sel.size] || 399
            // 无极调光加价
            const dimmingDelta = sel.dimming === '无极调光' ? 100 : (sel.dimming === '蓝牙Mesh' ? 80 : 0)
            return base + dimmingDelta
          }
        }
      case 'p2': // 观月组合
        return {
          variantGroups: [
            { key: 'combo', name: '组合', options: ['5+6', '4+5+6', '6+8'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色', '香槟金'] }
          ],
          getUnitPrice: (sel)=>{
            const map = { '5+6': 1820, '4+5+6': 2470, '6+8': 2990 }
            return map[sel.combo] || 1820
          }
        }
      case 'p3': // 轨道射灯
        return {
          variantGroups: [
            { key: 'power', name: '功率', options: ['10W', '12W', '20W', '30W', '35W'] },
            { key: 'beam', name: '光束角', options: ['10°', '15°', '24°', '36°', '55°'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '4000K', '5000K'] },
            { key: 'track', name: '轨道', options: ['二线', '三线', '四线(DALI)'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '10W': 109, '12W': 129, '20W': 169, '30W': 219, '35W': 259 }
            const base = baseMap[sel.power] || 129
            const trackDelta = sel.track === '四线(DALI)' ? 60 : 0
            return base + trackDelta
          }
        }
      case 'p4': // 磁吸灯套装
        return {
          variantGroups: [
            { key: 'kit', name: '套装', options: ['S', 'M', 'L', 'Pro'] },
            { key: 'rail', name: '导轨长度', options: ['1m', '1.5m', '2m', '2.5m'] },
            { key: 'dimming', name: '调光', options: ['无', '蓝牙Mesh', '0-10V', 'DALI'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K'] },
            { key: 'color', name: '颜色', options: ['黑色', '白色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { 'S': 899, 'M': 1299, 'L': 1699, 'Pro': 2199 }
            const base = baseMap[sel.kit] || 899
            const railDelta = sel.rail==='1.5m' ? 120 : (sel.rail==='2m' ? 220 : (sel.rail==='2.5m' ? 320 : 0))
            const dimmingDelta = sel.dimming==='蓝牙Mesh' ? 200 : (sel.dimming==='0-10V' ? 300 : (sel.dimming==='DALI' ? 400 : 0))
            return base + railDelta + dimmingDelta
          }
        }
      case 'p5': // 智能筒灯
        return {
          variantGroups: [
            { key: 'power', name: '功率', options: ['5W', '7W', '10W', '13W', '18W'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '3500K', '4000K', '5000K'] },
            { key: 'dimming', name: '调光', options: ['可控硅', '0-10V', 'DALI'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '5W': 69, '7W': 79, '10W': 89, '13W': 109, '18W': 139 }
            const base = baseMap[sel.power] || 89
            const dimmingDelta = sel.dimming==='0-10V' ? 30 : (sel.dimming==='DALI' ? 60 : 0)
            return base + dimmingDelta
          }
        }
      case 'p6': // 线型吊灯
        return {
          variantGroups: [
            { key: 'length', name: '长度', options: ['0.6m', '0.9m', '1.2m', '1.5m', '1.8m', '2.4m'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K', '5000K'] },
            { key: 'dimming', name: '调光', options: ['无', '0-10V', 'DALI'] },
            { key: 'color', name: '颜色', options: ['黑色', '白色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '0.6m': 399, '0.9m': 499, '1.2m': 599, '1.5m': 699, '1.8m': 899, '2.4m': 1199 }
            const base = baseMap[sel.length] || 599
            const dimmingDelta = sel.dimming==='0-10V' ? 120 : (sel.dimming==='DALI' ? 220 : 0)
            return base + dimmingDelta
          }
        }
      case 'p7': // 床头壁灯
        return {
          variantGroups: [
            { key: 'finish', name: '表面处理', options: ['黄铜', '拉丝镍', '黑色', '白色'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '4000K'] },
            { key: 'switch', name: '开关', options: ['带开关', '不带开关', '带USB'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '黄铜': 279, '黑色': 219, '白色': 219 }
            const base = baseMap[sel.finish] || 219
            const switchDelta = sel.switch==='不带开关' ? -20 : (sel.switch==='带USB' ? 30 : 0)
            return base + switchDelta
          }
        }
      case 'p8': // 庭院草坪灯
        return {
          variantGroups: [
            { key: 'height', name: '高度', options: ['30cm', '45cm', '60cm', '80cm'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K'] },
            { key: 'ip', name: '防护等级', options: ['IP65', 'IP67'] },
            { key: 'color', name: '颜色', options: ['深空灰', '黑色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '30cm': 159, '45cm': 189, '60cm': 229, '80cm': 289 }
            const base = baseMap[sel.height] || 159
            const ipDelta = sel.ip==='IP67' ? 40 : 0
            return base + ipDelta
          }
        }
      case 'p9': // 落地阅读灯
        return {
          variantGroups: [
            { key: 'adjust', name: '色温可调', options: ['否', '是', '无极可调'] },
            { key: 'color', name: '颜色', options: ['黑色', '白色', '灰色'] }
          ],
          getUnitPrice: (sel)=>{
            const base = 329
            const adj = sel.adjust==='是' ? 70 : (sel.adjust==='无极可调' ? 120 : 0)
            return base + adj
          }
        }
      case 'p10': // 氛围灯带
        return {
          variantGroups: [
            { key: 'length', name: '长度', options: ['2m', '5m', '10m', '15m'] },
            { key: 'type', name: '类型', options: ['单色', 'RGBW', 'RGBIC'] },
            { key: 'control', name: '控制', options: ['无', '蓝牙', 'Wi-Fi', 'Zigbee'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '2m': 79, '5m': 199, '10m': 349, '15m': 499 }
            const base = baseMap[sel.length] || 199
            const typeDelta = sel.type==='RGBIC' ? 80 : (sel.type==='RGBW' ? 60 : 0)
            const ctrlDelta = sel.control==='蓝牙' ? 40 : (sel.control==='Wi-Fi' ? 60 : (sel.control==='Zigbee' ? 80 : 0))
            return base + typeDelta + ctrlDelta
          }
        }
      case 'p11': // 厨房橱柜灯
        return {
          variantGroups: [
            { key: 'length', name: '长度', options: ['30cm', '60cm', '90cm', '120cm'] },
            { key: 'sensor', name: '传感器', options: ['否', '手扫', '人体感应'] },
            { key: 'cct', name: '色温', options: ['4000K'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '30cm': 99, '60cm': 149, '90cm': 199, '120cm': 239 }
            const base = baseMap[sel.length] || 149
            const sensor = sel.sensor==='人体感应' ? 30 : (sel.sensor==='手扫' ? 40 : 0)
            return base + sensor
          }
        }
      case 'p12': // 镜前灯
        return {
          variantGroups: [
            { key: 'power', name: '功率', options: ['9W', '12W', '18W', '24W'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K', '5000K'] },
            { key: 'color', name: '颜色', options: ['镀铬', '黑色', '金色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '9W': 189, '12W': 229, '18W': 269, '24W': 329 }
            const base = baseMap[sel.power] || 189
            return base
          }
        }
      default:
        return { variantGroups: [], getUnitPrice: ()=> this.data.price || 0 }
    }
  },

  recalcPrices(){
    const cfg = this.getSkuConfigByProductId(this.data.id)
    const unit = cfg.getUnitPrice ? cfg.getUnitPrice(this.data.selectedVariants || {}) : (this.data.price||0)
    const qty = Math.max(1, Number(this.data.quantity || 1))
    const total = unit * qty
    this.setData({ price: unit, totalPrice: total })
  },

  recalcParams(){
    const params = this.computeParamsBySelection(this.data.id, this.data.selectedVariants || {})
    this.setData({ params })
  },

  isSelected(groupKey, value) {
    const current = this.data.selectedVariants[groupKey]
    return current === value
  },
  onSelectVariant(e) {
    const group = e.currentTarget.dataset.group
    const value = e.currentTarget.dataset.value
    this.setData({ [`selectedVariants.${group}`]: value }, () => {
      this.recalcPrices()
      this.recalcParams()
      // 同步选中态到渲染用的 variantGroups
      const cfg = this.getSkuConfigByProductId(this.data.id)
      const enriched = this.enrichVariantGroups(cfg.variantGroups || [], this.data.selectedVariants)
      this.setData({ variantGroups: enriched })
    })
  },
  onInc() {
    const q = Math.max(1, (this.data.quantity || 1) + 1)
    this.setData({ quantity: q }, () => {
      this.recalcPrices()
      this.recalcParams()
    })
  },

  enrichVariantGroups(groups, selected){
    return (groups || []).map(g => Object.assign({}, g, { selected: selected[g.key] }))
  },
  onDec() {
    const q = Math.max(1, (this.data.quantity || 1) - 1)
    this.setData({ quantity: q }, () => {
      this.recalcPrices()
      this.recalcParams()
    })
  },

  getProductMetaById(id){
    switch(id){
      case 'p1':
        return {
          desc: '极简圆形吸顶灯，均匀面光，适合卧室客厅等空间。',
          images: [
            'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
            'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg'
          ]
        }
      case 'p2':
        return {
          desc: '环形吊灯组合，适配多种户型空间，营造柔和氛围。',
          images: [
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            'https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg'
          ]
        }
      case 'p3':
        return {
          desc: '高显指轨道射灯，支持多种光束角度，突出重点陈列。',
          images: [
            'https://images.pexels.com/photos/269218/pexels-photo-269218.jpeg',
            'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg'
          ]
        }
      case 'p4':
        return {
          desc: '通用磁吸轨道照明套装，按需自由组合，快速部署。',
          images: [
            'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg',
            'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
          ]
        }
      case 'p5':
        return {
          desc: '智能筒灯，支持多种调光协议，显指高，防眩舒适。',
          images: [
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg'
          ]
        }
      case 'p6':
        return {
          desc: '线型吊灯，光线均匀，适用于餐桌与办公工位。',
          images: [
            'https://images.pexels.com/photos/1121123/pexels-photo-1121123.jpeg',
            'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
          ]
        }
      case 'p7':
        return {
          desc: '床头壁灯，局部阅读照明与氛围兼顾，低眩光设计。',
          images: [
            'https://images.pexels.com/photos/842946/pexels-photo-842946.jpeg',
            'https://images.pexels.com/photos/704590/pexels-photo-704590.jpeg'
          ]
        }
      case 'p8':
        return {
          desc: '户外草坪灯，出光柔和，耐候型涂层，支持高防护等级。',
          images: [
            'https://images.pexels.com/photos/462235/pexels-photo-462235.jpeg',
            'https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg'
          ]
        }
      case 'p9':
        return {
          desc: '可调光阅读落地灯，指向性强，适合沙发与书桌旁。',
          images: [
            'https://images.pexels.com/photos/1248583/pexels-photo-1248583.jpeg',
            'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
          ]
        }
      case 'p10':
        return {
          desc: '氛围灯带，支持 RGBIC 与蓝牙/Wi‑Fi 控制，多场景联动。',
          images: [
            'https://images.pexels.com/photos/7130537/pexels-photo-7130537.jpeg',
            'https://images.pexels.com/photos/1121123/pexels-photo-1121123.jpeg'
          ]
        }
      case 'p11':
        return {
          desc: '橱柜线性灯，磁吸安装与手扫感应可选，明亮不刺眼。',
          images: [
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg'
          ]
        }
      case 'p12':
        return {
          desc: '防雾镜前灯，显色真实，IP44 防护适配卫浴环境。',
          images: [
            'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
            'https://images.pexels.com/photos/842946/pexels-photo-842946.jpeg'
          ]
        }
      default:
        return {
          desc: '以简约设计还原真实光影，显指高、眩光低，适配多种空间。',
          images: [
            'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'
          ]
        }
    }
  },

  computeParamsBySelection(id, sel){
    switch(id){
      case 'p1': {
        const powerMap = { '40cm': '24W', '50cm': '36W', '60cm': '48W', '70cm': '60W' }
        return [
          { key: '尺寸', value: sel.size || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '功率', value: powerMap[sel.size] || '—' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '输入电压', value: 'AC220V' },
          { key: '材质', value: '铝合金 + PMMA 导光板' }
        ]
      }
      case 'p2': {
        const wattMap = { '5+6': '120W', '4+5+6': '180W', '6+8': '240W' }
        return [
          { key: '组合', value: sel.combo || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '功率范围', value: wattMap[sel.combo] || '—' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p3': {
        return [
          { key: '功率', value: sel.power || '-' },
          { key: '光束角', value: sel.beam || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '轨道', value: sel.track || '-' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' },
          { key: '材质', value: '铝合金压铸灯体' }
        ]
      }
      case 'p4': {
        return [
          { key: '套装', value: sel.kit || '-' },
          { key: '导轨长度', value: sel.rail || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '系统电压', value: 'DC48V 磁吸系统' }
        ]
      }
      case 'p5': {
        const cutoutMap = { '5W': '55mm', '7W': '70mm', '10W': '90mm', '13W': '105mm', '18W': '120mm' }
        return [
          { key: '功率', value: sel.power || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '开孔', value: cutoutMap[sel.power] || '—' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p6': {
        return [
          { key: '长度', value: sel.length || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '材质', value: '铝型材 + 亚克力' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p7': {
        return [
          { key: '表面处理', value: sel.finish || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '开关', value: sel.switch || '-' },
          { key: '功率', value: '6W' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p8': {
        return [
          { key: '高度', value: sel.height || '-' },
          { key: '色温', value: sel.cct || '3000K' },
          { key: '防护等级', value: sel.ip || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' },
          { key: '材质', value: '铝合金机身，钢化玻璃' }
        ]
      }
      case 'p9': {
        return [
          { key: '色温可调', value: sel.adjust || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '功率', value: '10W' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p10': {
        return [
          { key: '长度', value: sel.length || '-' },
          { key: '类型', value: sel.type || '-' },
          { key: '控制', value: sel.control || '-' },
          { key: '工作电压', value: 'DC24V' },
          { key: '防护等级', value: 'IP20（室内）' }
        ]
      }
      case 'p11': {
        return [
          { key: '长度', value: sel.length || '-' },
          { key: '传感器', value: sel.sensor || '-' },
          { key: '色温', value: '4000K' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '工作电压', value: 'DC12V' },
          { key: '安装方式', value: '磁吸 / 螺丝固定' }
        ]
      }
      case 'p12': {
        return [
          { key: '功率', value: sel.power || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '防护等级', value: 'IP44' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      default:
        return [
          { key: '色温', value: '3000K / 4000K 可选' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '功率', value: '视规格而定' },
          { key: '材质', value: '铝合金 + PMMA' }
        ]
    }
  },

  onAddToCart() {
    const item = {
      id: this.data.id,
      title: this.data.name,
      name: this.data.name,
      price: Number(this.data.price)||0,
      image: (this.data.images && this.data.images[0]) || '',
      quantity: Math.max(1, Number(this.data.quantity||1)),
      specs: this.data.selectedVariants || {}
    }
    const list = wx.getStorageSync('cartItems') || []
    // 合并同款（按 id + specs 键）
    const key = JSON.stringify({ id:item.id, specs:item.specs||{} })
    let merged=false
    for(const i of list){
      const k = JSON.stringify({ id:i.id, specs:i.specs||{} })
      if(k===key){ i.quantity = Math.max(1, Number(i.quantity||1)) + item.quantity; merged=true; break }
    }
    if(!merged) list.unshift(item)
    wx.setStorageSync('cartItems', list)
    wx.showToast({ title: '已加入购物车', icon: 'none' })
  },
  onBuyNow() {
    const item = {
      id: this.data.id,
      name: this.data.name,
      price: this.data.price,
      image: (this.data.images && this.data.images[0]) || '',
      quantity: this.data.quantity,
      specs: this.data.selectedVariants
    }
    const query = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
  },
  onContact() {
    wx.navigateTo({ url: '/pages/support/contact/contact' })
  },
  onToggleFav() {
    const fav = !this.data.fav
    this.setData({ fav })
    const list = wx.getStorageSync('mall_favorites') || []
    if (fav) {
      const item = {
        id: this.data.id,
        name: this.data.name,
        price: this.data.price,
        image: (this.data.images && this.data.images[0]) || '',
        specs: this.data.selectedVariants || {}
      }
      const exists = list.some(i => i.id === item.id)
      if (!exists) list.unshift(item)
      wx.setStorageSync('mall_favorites', list)
    } else {
      const next = list.filter(i => i.id !== this.data.id)
      wx.setStorageSync('mall_favorites', next)
    }
    wx.showToast({ title: fav ? '已收藏' : '已取消收藏', icon: 'none' })
  },
  onGoCart() {
    wx.navigateTo({ url: '/pages/mall/cart/cart' })
  }
})


