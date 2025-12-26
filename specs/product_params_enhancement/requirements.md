# 需求文档：灯具商品参数表单优化

## 介绍

基于专业灯具选型表（9个品类）的深入分析，优化后台管理系统的商品管理表单和小程序端商品详情页，实现灯具专业参数的完整录入、管理和展示功能。

### 背景

当前商品管理表单仅支持基础字段（名称、价格、库存、图片等），无法满足灯具行业的专业参数需求。灯具选型涉及大量专业参数（功率、色温、显色指数、光束角等），不同品类的灯具参数差异较大。

### 目标

1. 后台管理端：实现基于分类的参数模板系统，支持专业灯具参数录入
2. 小程序端：优化商品详情页的参数展示和规格选择体验
3. 数据层：扩展商品数据结构，支持丰富的参数存储

---

## 需求

### 需求 1 - 分类参数模板系统

**用户故事：** 作为后台管理员，我希望在新增/编辑商品时，系统能根据商品分类自动加载对应的参数模板，这样我可以快速填写专业的灯具参数，而不需要手动添加每一个字段。

#### 验收标准

1. When 选择商品分类时，the 系统 shall 自动加载该分类预设的参数模板字段
2. When 分类为"吸顶灯"时，the 表单 shall 显示尺寸、功率、色温、显色指数、光通量、调光方式、适用面积等参数字段
3. When 分类为"筒灯/射灯"时，the 表单 shall 显示功率、开孔尺寸、光束角、色温、显色指数、光源类型、调光方式等参数字段
4. When 分类为"灯带"时，the 表单 shall 显示每米功率、电压、色温、灯珠数量、防护等级、宽度等参数字段
5. When 分类为"智能灯具"时，the 表单 shall 额外显示控制方式、智能平台、协议类型等参数字段
6. When 分类为"磁吸灯"时，the 表单 shall 显示套装规格、轨道长度、光束角、色温、调光方式、轨道规格、灯头类型等参数字段
7. When 分类为"吊灯/装饰灯"时，the 表单 shall 显示灯体直径、组合规格、吊线长度、色温、风格、适用层高、适用空间等参数字段
8. When 分类为"壁灯"时，the 表单 shall 显示功率、色温、表面处理、开关类型、灯臂长度、出光方式、适用场景等参数字段
9. When 分类为"平板灯"时，the 表单 shall 显示尺寸规格、功率、色温、显色指数、发光方式、安装方式等参数字段
10. When 分类为"光源/灯泡"时，the 表单 shall 显示灯头规格、功率、色温、是否可调光、替换瓦数等参数字段
11. When 分类为"户外灯"时，the 表单 shall 显示高度、功率、色温、防护等级、材质、供电方式等参数字段
12. When 切换商品分类时，the 系统 shall 保留已填写的通用参数，仅重置分类特有参数

### 需求 2 - 可选规格（SKU）管理增强

**用户故事：** 作为后台管理员，我希望能够灵活配置商品的可选规格（如色温、功率、尺寸），并设置不同规格组合的价格和库存，这样用户可以选择自己需要的规格进行购买。

#### 验收标准

1. When 配置可选规格时，the 系统 shall 支持从预设选项中选择或自定义规格项
2. When 添加"色温"规格时，the 系统 shall 提供常用色温选项：2700K、3000K、3500K、4000K、5000K、6000K
3. When 添加"功率"规格时，the 系统 shall 根据灯具类型提供合理的功率选项范围
4. When 添加"光束角"规格时，the 系统 shall 提供常用光束角选项：10°、15°、24°、36°、55°、60°、90°
5. When 规格组合生成后，the 系统 shall 支持为每个SKU组合单独设置价格和库存
6. When 某规格组合库存为0时，the 小程序端 shall 显示该规格为"缺货"状态

### 需求 3 - 固定规格参数管理

**用户故事：** 作为后台管理员，我希望能够填写商品的固定技术参数（如显色指数、材质、防护等级），这些参数将在商品详情页展示给用户，帮助用户了解产品的技术特性。

#### 验收标准

1. When 填写固定参数时，the 表单 shall 根据分类模板提供结构化的输入字段
2. When 参数类型为"显色指数"时，the 表单 shall 提供 Ra≥80、Ra≥90、Ra≥92、Ra≥95 等常用选项
3. When 参数类型为"防护等级"时，the 表单 shall 提供 IP20、IP44、IP65、IP67、IP68 等选项
4. When 参数类型为"材质"时，the 表单 shall 支持多选：铝材、压铸铝、亚克力、PC、玻璃等
5. When 保存商品时，the 系统 shall 校验必填参数是否已填写完整

### 需求 4 - 小程序商品详情页参数展示优化

**用户故事：** 作为小程序用户，我希望在商品详情页能够清晰地查看灯具的专业参数，并按照类型分组展示，这样我可以快速了解产品的技术特性并做出购买决策。

#### 验收标准

1. When 查看商品详情时，the 页面 shall 按类型分组展示参数（光学参数、电气参数、物理参数、功能参数）
2. When 显示光学参数时，the 页面 shall 高亮显示关键指标：显色指数Ra、色温范围、光束角
3. When 产品有UGR值时，the 页面 shall 展示眩光评级说明（UGR<19：舒适，UGR<22：一般）
4. When 选择规格时，the 价格和相关参数 shall 实时更新
5. When 参数较多时，the 页面 shall 支持折叠/展开切换，默认显示核心参数

### 需求 5 - 商品列表筛选增强

**用户故事：** 作为后台管理员，我希望能够按照灯具专业参数筛选商品列表，这样我可以快速找到特定规格的商品进行管理。

#### 验收标准

1. When 在商品列表页时，the 筛选栏 shall 支持按功率范围筛选
2. When 在商品列表页时，the 筛选栏 shall 支持按色温筛选
3. When 在商品列表页时，the 筛选栏 shall 支持按品牌筛选
4. When 应用筛选条件后，the 列表 shall 实时更新显示符合条件的商品

---

## 参数模板定义

### 通用参数（所有分类共有）

| 参数名 | 字段key | 类型 | 是否必填 | 备注 |
|--------|---------|------|----------|------|
| 品牌 | brand | string | 是 | 支持选择或自定义 |
| 型号 | model | string | 否 | |
| 颜色 | color | string[] | 是 | 可多选，作为SKU规格 |
| 材质 | material | string | 是 | |

### 吸顶灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 尺寸 | size | string | ✅ | 如 40cm、50cm、60cm |
| 功率 | power | string | ❌ | 如 24W、36W、48W |
| 色温 | colorTemp | string | ✅ | 2700K-6000K |
| 显色指数 | ra | string | ❌ | Ra≥80/90/92/95 |
| 光通量 | luminousFlux | string | ❌ | 如 2160lm |
| 调光方式 | dimmingType | string | ✅ | 无/三段/无极/蓝牙Mesh |
| 适用面积 | applicableArea | string | ❌ | 如 10-15㎡ |

### 筒灯/射灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 功率 | power | string | ✅ | 5W-35W |
| 开孔尺寸 | cutoutSize | string | ❌ | 如 Φ75mm |
| 光束角 | beamAngle | string | ✅ | 10°-90° |
| 色温 | colorTemp | string | ✅ | 2700K-5000K |
| 显色指数 | ra | string | ❌ | |
| 光源类型 | sourceType | string | ❌ | COB/SMD |
| 调光方式 | dimmingType | string | ✅ | 可控硅/0-10V/DALI |
| UGR | ugr | string | ❌ | 眩光值 |

### 灯带参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 长度 | length | string | ✅ | 2m/5m/10m |
| 每米功率 | powerPerMeter | string | ❌ | 如 10W/m |
| 电压 | voltage | string | ❌ | 12V/24V |
| 色温 | colorTemp | string | ✅ | |
| 类型 | type | string | ✅ | 单色/RGBW/RGBIC |
| 灯珠数量 | ledCount | string | ❌ | 每米灯珠数 |
| 防护等级 | ipRating | string | ❌ | IP20/IP65/IP68 |
| 控制方式 | controlType | string | ✅ | 无/蓝牙/WiFi/Zigbee |

### 智能灯具参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 功率 | power | string | ✅ | |
| 色温 | colorTemp | string | ✅ | |
| 控制方式 | controlType | string | ✅ | WiFi/蓝牙/Zigbee |
| 智能平台 | smartPlatform | string | ❌ | 涂鸦/华为HiLink/小米 |
| 调光调色 | dimmable | boolean | ❌ | 是否支持 |
| 显色指数 | ra | string | ❌ | |

### 风扇灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 风扇直径 | fanDiameter | string | ✅ | 42寸/48寸/52寸 |
| 功率 | power | string | ❌ | |
| 色温 | colorTemp | string | ✅ | |
| 电机类型 | motorType | string | ❌ | 直流变频/交流 |
| 风量档位 | fanSpeed | string | ❌ | 3档/6档 |
| 控制方式 | controlType | string | ❌ | 遥控/App |
| 适用面积 | applicableArea | string | ❌ | |

### 磁吸灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 套装规格 | kitType | string | ✅ | S/M/L/Pro |
| 轨道长度 | railLength | string | ✅ | 1m/1.5m/2m/2.5m |
| 功率 | power | string | ❌ | |
| 色温 | colorTemp | string | ✅ | 3000K/4000K |
| 光束角 | beamAngle | string | ✅ | 15°/24°/36°/60° |
| 显色指数 | ra | string | ❌ | Ra≥90/95 |
| 轨道规格 | railSpec | string | ❌ | 20mm/25mm/DC48V |
| 调光方式 | dimmingType | string | ✅ | 无/蓝牙Mesh/0-10V/DALI |
| 系统电压 | systemVoltage | string | ❌ | DC48V |
| 灯头类型 | headType | string | ✅ | 射灯头/格栅头/线性灯/泛光灯 |
| 可调角度 | adjustAngle | string | ❌ | 0-90° |

### 吊灯/装饰灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 灯体直径 | diameter | string | ✅ | 如 40cm/60cm/80cm |
| 组合规格 | comboSpec | string | ✅ | 单头/3头/5头/环形组合 |
| 吊线长度 | wireLength | string | ❌ | 可调节范围 |
| 功率 | power | string | ❌ | |
| 色温 | colorTemp | string | ✅ | 2700K-4000K |
| 显色指数 | ra | string | ❌ | |
| 光通量 | luminousFlux | string | ❌ | |
| 风格 | style | string | ❌ | 现代简约/北欧/中式/轻奢 |
| 适用层高 | suitableHeight | string | ❌ | 如 2.7m-3.5m |
| 适用空间 | suitableSpace | string | ❌ | 客厅/餐厅/卧室 |
| 调光方式 | dimmingType | string | ✅ | 无/分段/无极 |

### 壁灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 功率 | power | string | ❌ | 如 6W/9W/12W |
| 色温 | colorTemp | string | ✅ | 2700K/3000K/4000K |
| 表面处理 | finish | string | ✅ | 黄铜/拉丝镍/黑色/白色 |
| 开关类型 | switchType | string | ✅ | 带开关/不带开关/带USB |
| 显色指数 | ra | string | ❌ | Ra≥90 |
| 灯臂长度 | armLength | string | ✅ | 如 20cm/30cm/可调节 |
| 出光方式 | lightOutput | string | ❌ | 上下出光/单向出光/可调 |
| 防护等级 | ipRating | string | ❌ | IP20/IP44（浴室用） |
| 安装方式 | mountType | string | ❌ | 壁挂/插电 |
| 适用场景 | suitableScene | string | ❌ | 床头/走廊/浴室镜前 |

### 平板灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 尺寸规格 | panelSize | string | ✅ | 300×300/300×600/600×600mm |
| 功率 | power | string | ❌ | 18W/24W/36W/48W |
| 色温 | colorTemp | string | ✅ | 3000K/4000K/5700K |
| 显色指数 | ra | string | ❌ | Ra≥80/90 |
| 光通量 | luminousFlux | string | ❌ | |
| 发光方式 | lightMode | string | ❌ | 侧发光/直下式 |
| 安装方式 | installType | string | ❌ | 嵌入式/明装/吊装 |
| 驱动类型 | driverType | string | ❌ | 内置/外置 |

### 光源/灯泡参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 灯头规格 | baseType | string | ✅ | E27/E14/GU10/MR16 |
| 功率 | power | string | ✅ | 3W/5W/7W/9W/12W |
| 色温 | colorTemp | string | ✅ | 2700K-6000K |
| 显色指数 | ra | string | ❌ | |
| 光通量 | luminousFlux | string | ❌ | |
| 发光角度 | beamAngle | string | ❌ | 120°/180°/360° |
| 是否可调光 | dimmable | boolean | ✅ | 是/否 |
| 替换瓦数 | replaceWatt | string | ❌ | 替换传统灯泡瓦数 |
| 寿命 | lifespan | string | ❌ | 如 25000h |

### 户外灯参数模板

| 参数名 | 字段key | 类型 | 是否SKU | 备注 |
|--------|---------|------|---------|------|
| 高度 | height | string | ✅ | 30cm/45cm/60cm/80cm |
| 功率 | power | string | ❌ | |
| 色温 | colorTemp | string | ✅ | 3000K/4000K |
| 防护等级 | ipRating | string | ✅ | IP65/IP67 |
| 材质 | material | string | ❌ | 铝合金/不锈钢 |
| 安装方式 | installType | string | ❌ | 地插/底座固定 |
| 供电方式 | powerSupply | string | ❌ | 市电/太阳能 |

---

## 设计风格与配色

### 后台管理表单
- 保持现有 Ant Design 风格
- 参数区域采用折叠面板（Collapse）分组
- 必填字段红色星号标记
- 参数提示信息使用 Tooltip

### 小程序商品详情页
- 参数分组展示，使用卡片样式
- 关键参数高亮显示（如 Ra≥90 使用红色标签）
- 保持现有苹果风格设计语言
- 规格选择使用圆角标签样式

---

## 非功能性需求

1. **性能**：表单切换分类时，参数模板加载时间 < 500ms
2. **兼容性**：支持现有商品数据的平滑迁移
3. **可扩展性**：支持后续新增灯具分类和参数字段

