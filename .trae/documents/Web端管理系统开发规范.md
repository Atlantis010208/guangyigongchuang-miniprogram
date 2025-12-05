# 核心指令：构建一个基于React的B端管理系统

**目标**：创建一个功能完整的B端管理系统，用于管理微信小程序后台数据。严格遵循以下技术栈、架构和UI规范。

### **1. 项目初始化与技术栈**

- **框架与工具**:
    - **React**: `18.3.1` + **TypeScript**: `5.8.3`
    - **构建**: `Vite 6.3.5`
- **核心库**:
    - **UI**: `Ant Design 5.26.7` + **图标**: `@ant-design/icons 6.0.0` & `lucide-react 0.511.0`
    - **路由**: `React Router DOM 7.7.1`
    - **状态管理**: `Zustand 5.0.3`
    - **样式**: `Tailwind CSS 3.4.17`
    - **图表**: `echarts 5.5.1`
    - **工具**: `clsx`, `tailwind-merge`, `sonner`, `dayjs`
- **开发工具**:
    - **Linter**: `ESLint` + `TypeScript ESLint`
    - **CSS处理器**: `PostCSS` + `Autoprefixer`
    - **路径别名**: `vite-tsconfig-paths` (`@/*` 指向 `./src/*`)

### **2. 项目结构**

请遵循以下目录结构，包含了业务模块的扩展：

```
src/
├── components/      # 通用组件 (Breadcrumb, Empty, ImageUpload)
├── hooks/           # 自定义Hook (useTheme, useAuth)
├── lib/             # 工具函数 (utils.ts, request.ts)
├── types/           # TypeScript 类型定义 (User, Product, Order)
├── pages/           # 页面
│   ├── Home.tsx     # 仪表盘
│   ├── Login.tsx    # 登录页
│   ├── system/      # 系统管理
│   │   ├── UserManagement.tsx
│   │   ├── RoleManagement.tsx
│   │   └── PermissionManagement.tsx
│   ├── business/    # 核心业务管理
│   │   ├── ProductManagement.tsx   # 商品管理
│   │   ├── OrderManagement.tsx     # 订单管理
│   │   ├── RequestManagement.tsx   # 需求/服务管理
│   │   └── DesignerManagement.tsx  # 设计师管理
├── assets/          # 静态资源
├── store/           # Zustand store
├── App.tsx          # 主布局和路由
└── main.tsx         # 应用入口
```

### **3. 核心布局与样式规范 (App.tsx)**

- **整体布局**: 左侧可折叠Sider + 顶部Header + 主内容区Content。
- **主内容区 (Content)**:
    - **背景**: 透明 (`background: 'transparent'`)。
    - **外间距**: **必须设置** `margin: '16px'`，确保与布局边界有统一间距。
    - **最小高度**: `minHeight: 'calc(100vh - 112px)'`。
- **页面容器 (所有`pages/`下的组件)**:
    - **背景**: 透明。
    - **内间距**: **禁止设置** `padding`。页面布局完全由模块化卡片的 `margin` 控制。
- **模块化卡片 (Card)**:
    - **样式**: 白色背景 (`#ffffff`)，8px圆角，`boxShadow: '0 1px 4px rgba(0,21,41,.08)'`。
    - **间距**: 使用 `marginBottom: '16px'` 控制垂直间距。
    - **高度对齐**: 同行的卡片必须使用Flexbox（如AntD的 `Row` 和 `Col` 配合`display: flex`）实现等高对齐。

### **4. 关键页面与组件设计**

#### **通用表格规范**
- **对齐**: 所有列表头和内容**居中对齐** (`align: 'center'`)。
- **列宽**: 严格遵守指定宽度（如操作列: 200px, 时间列: 160px, ID列: 100px）。
- **样式**:
    - **用户信息**: `头像(Avatar) + 用户名 + Tag (用户ID)` 格式。
    - **状态**: 使用不同颜色的AntD `Tag` 组件 (`active/success`: green, `inactive/pending`: orange, `error`: red)。
    - **操作按钮**: 统一使用 `type="link"` 的小尺寸按钮 (`size="small"`)，并包含图标 (如 `Edit`, `Trash2`)。
- **功能**: 必须包含排序、分页（带总数显示）、响应式横向滚动 (`scroll={{ x: 'max-content' }}`)。

#### **登录页 (Login.tsx)**
- 全屏渐变背景，内容区域为居中、带阴影的白色卡片（400px宽）。
- 表单包含用户名、密码、记住我，并实现表单验证和模拟登录（1秒延迟）。
- **预设账号**: `admin` / `123456` (模拟超级管理员权限)。

#### **首页 (Home.tsx)**
- **统计卡片**: 展示 总用户数、总订单额、待处理需求、今日新增商品（模拟数据）。
- **图表**: 使用 ECharts 展示 "近7日订单趋势" (折线图) 和 "商品分类占比" (饼图)。
- **快捷操作**: 快速跳转到 "发布商品"、"查看待办"。

#### **系统管理 (System)**
- **用户管理**: 管理 `users` 集合数据。字段: `_id`, `nickName`, `avatarUrl`, `phoneNumber`, `role` (0:管理员, 1:设计师, 2:普通用户), `createTime`.
- **角色管理**: 简单的角色定义与权限分配（模拟）。
- **权限管理**: 树形结构展示菜单权限。

#### **业务管理 (Business) - 结合现有云开发数据结构**
- **商品管理 (ProductManagement)**:
    - **对应集合**: `products`, `categories`
    - **功能**: CRUD。
    - **字段**: 商品图 (`images`), 名称 (`name`), 分类 (`categoryId`), 基础价格 (`basePrice`), 库存 (`stock`), 状态 (上架/下架).
    - **新增/编辑**: 使用 `Drawer` 或 `Modal` 表单，包含图片上传占位符。

- **订单管理 (OrderManagement)**:
    - **对应集合**: `orders`
    - **功能**: 列表展示与状态流转。
    - **字段**: 订单号 (`orderNo`), 用户 (`userId`), 总金额 (`totalAmount`), 状态 (`status`: pending/paid/shipped/completed), 创建时间.
    - **筛选**: 按 订单状态、下单时间 筛选。

- **服务需求管理 (RequestManagement)**:
    - **对应集合**: `requests` (设计需求/定制需求)
    - **功能**: 查看用户提交的需求，进行跟进状态更新。
    - **字段**: 需求单号, 用户, 类型 (`type`), 预算范围, 风格偏好, 当前状态 (`status`: pending/processing/done).

- **设计师管理 (DesignerManagement)**:
    - **对应集合**: `designers`
    - **功能**: 管理入驻设计师信息。
    - **字段**: 头像, 姓名 (`name`), 头衔 (`title`), 风格标签 (`style`), 作品集预览.

### **5. 配置文件要点**

- **`vite.config.ts`**: 使用默认的 `react()` 插件，配置 `@` 别名。
- **`tailwind.config.js`**: `darkMode` 设为 `"class"`，配置 `content` 路径覆盖所有组件。
- **`src/index.css`**:
    - 引入Tailwind指令。
    - **移除** `body` 上的 `display: flex; place-items: center;` (Vite默认模板样式)，确保 `body` 为 `display: block` 且占满全屏，背景色设为 `#f0f2f5`。

### **执行要求**

- 严格按照上述规范和版本号创建项目。
- **数据模拟**: 所有页面需使用 **本地 Mock 数据** (定义在 `src/lib/mockData.ts`)，但数据结构必须与上述云开发集合字段保持一致，以便未来接入真实API。
- 确保代码质量，所有组件必须有清晰的 TypeScript 类型定义。
- 完成响应式设计，确保在移动端适配良好（侧边栏自动收起）。
