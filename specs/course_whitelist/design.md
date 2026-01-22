# 课程白名单授权功能 - 技术方案设计

## 一、架构概览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              课程白名单授权系统                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────┐          ┌───────────────────────┐              │
│  │     管理后台 (Web)     │          │    小程序端 (MP)       │              │
│  │  React + TypeScript   │          │  WXML + WXSS + JS     │              │
│  ├───────────────────────┤          ├───────────────────────┤              │
│  │ • 白名单管理页面       │          │ • 手机号授权登录       │              │
│  │ • Excel 文件上传导入   │          │ • 课程详情页           │              │
│  │ • 激活状态统计         │          │ • 我的订单页           │              │
│  └───────────┬───────────┘          └───────────┬───────────┘              │
│              │                                  │                          │
│              │ callFunction                     │ wx.cloud.callFunction    │
│              ▼                                  ▼                          │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                         云函数层 (CloudBase)                        │    │
│  ├───────────────────────────────────────────────────────────────────┤    │
│  │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │    │
│  │ │admin_whitelist_ │ │ getPhoneNumber  │ │course_purchase_ │       │    │
│  │ │    import       │ │   (改造)        │ │    check        │       │    │
│  │ └─────────────────┘ └─────────────────┘ └─────────────────┘       │    │
│  │ ┌─────────────────┐ ┌─────────────────┐                           │    │
│  │ │admin_whitelist_ │ │  orders_create  │                           │    │
│  │ │    list         │ │    (复用)       │                           │    │
│  │ └─────────────────┘ └─────────────────┘                           │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│              │                                                             │
│              ▼                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                         数据库层 (MongoDB)                          │    │
│  ├───────────────────────────────────────────────────────────────────┤    │
│  │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │    │
│  │ │course_whitelist │ │     orders      │ │     courses     │       │    │
│  │ │    (新建)       │ │    (已有)       │ │    (已有)       │       │    │
│  │ └─────────────────┘ └─────────────────┘ └─────────────────┘       │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 小程序端 | 微信小程序原生 | WXML + WXSS + JS |
| 管理后台 | React 18 + TypeScript | Ant Design 组件库 |
| 云函数 | Node.js 18 | wx-server-sdk |
| 数据库 | 云开发数据库 | MongoDB 风格 |
| 文件解析 | xlsx (SheetJS) | Excel 文件解析 |

---

## 二、数据库设计

### 2.1 新建集合：`course_whitelist`

```javascript
{
  "_id": "自动生成",
  "phone": "13812345678",           // 手机号（11位）
  "courseId": "CO_DEFAULT_001",     // 课程ID（固定值）
  "courseName": "十年经验二哥 灯光设计课", // 课程名称（冗余，便于查询展示）
  "status": "pending",              // 状态：pending（待激活）/ activated（已激活）
  "source": "2025年1月批次",        // 来源/批次备注（可选）
  
  // 激活信息（激活后填充）
  "activatedAt": null,              // 激活时间戳
  "activatedUserId": null,          // 激活用户的 OPENID
  "orderId": null,                  // 创建的订单 _id
  "orderNo": null,                  // 创建的订单号
  
  // 系统字段
  "createdAt": 1704326400000,       // 创建时间戳
  "createdBy": "admin_xxx",         // 创建人（管理员ID）
  "updatedAt": 1704326400000        // 更新时间戳
}
```

### 2.2 索引设计

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `idx_phone_course` | `{ phone: 1, courseId: 1 }` | **唯一索引** | 防止同一手机号重复导入 |
| `idx_status` | `{ status: 1 }` | 普通索引 | 按状态筛选 |
| `idx_activated_user` | `{ activatedUserId: 1 }` | 普通索引 | 查询用户激活记录 |
| `idx_created_at` | `{ createdAt: -1 }` | 普通索引 | 按时间倒序 |

### 2.3 订单数据扩展

白名单激活创建的订单，在 `orders` 集合中增加以下字段：

```javascript
{
  // ... 原有订单字段 ...
  
  // 白名单标记（内部字段，前端不展示）
  "source": "whitelist",            // 订单来源：whitelist 表示白名单激活
  "whitelistId": "白名单记录_id"     // 关联的白名单记录ID
}
```

---

## 三、云函数设计

### 3.1 新增云函数

#### 3.1.1 `admin_whitelist_import` - 白名单批量导入

**功能**：解析上传的 Excel/CSV 文件，批量导入白名单数据

**入参**：
```typescript
{
  fileData: string;      // Base64 编码的文件内容
  fileName: string;      // 文件名（用于判断格式）
  source?: string;       // 批次备注（可选）
}
```

**出参**：
```typescript
{
  success: boolean;
  code: string;
  data: {
    total: number;       // 文件中总记录数
    successCount: number;// 成功导入数
    duplicateCount: number; // 重复跳过数
    invalidCount: number;   // 格式无效数
    details: {
      duplicates: string[];  // 重复的手机号列表
      invalids: string[];    // 无效的手机号列表
    }
  };
  errorMessage?: string;
}
```

**处理逻辑**：
```
1. 验证管理员权限
2. 解析文件内容（支持 xlsx/xls/csv）
3. 提取手机号列（第一列或标题为"手机号"的列）
4. 校验手机号格式（11位数字，1开头）
5. 查询已存在的手机号（去重）
6. 批量插入新记录
7. 返回导入结果统计
```

---

#### 3.1.2 `admin_whitelist_list` - 白名单列表查询

**功能**：分页查询白名单数据，支持筛选和搜索

**入参**：
```typescript
{
  limit?: number;        // 每页数量，默认 20
  offset?: number;       // 偏移量，默认 0
  status?: 'pending' | 'activated' | 'all';  // 状态筛选
  phone?: string;        // 手机号搜索（模糊匹配）
  source?: string;       // 来源筛选
}
```

**出参**：
```typescript
{
  success: boolean;
  code: string;
  data: WhitelistRecord[];
  total: number;
  stats: {
    totalCount: number;      // 总数
    pendingCount: number;    // 待激活数
    activatedCount: number;  // 已激活数
    activationRate: string;  // 激活率（百分比）
  };
}
```

---

### 3.2 改造现有云函数

#### 3.2.1 `getPhoneNumber` - 增加白名单激活逻辑

**改造位置**：在保存手机号到用户记录之后

**新增逻辑**：
```javascript
// === 新增：白名单激活检查 ===
async function checkAndActivateWhitelist(phone, openid) {
  const db = cloud.database();
  
  // 1. 查询白名单
  const whitelistRes = await db.collection('course_whitelist')
    .where({
      phone: phone,
      status: 'pending'
    })
    .limit(1)
    .get();
  
  if (!whitelistRes.data || whitelistRes.data.length === 0) {
    console.log('[getPhoneNumber] 未找到待激活的白名单记录');
    return null;
  }
  
  const whitelist = whitelistRes.data[0];
  const now = Date.now();
  
  // 2. 创建课程订单
  const orderNo = `WL${now}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const orderDoc = {
    orderNo,
    userId: openid,
    _openid: openid,
    category: 'course',
    status: 'completed',  // 直接完成状态
    paid: true,
    paidAt: now,
    source: 'whitelist',  // 标记来源
    whitelistId: whitelist._id,
    params: {
      items: [{
        id: whitelist.courseId,
        courseId: whitelist.courseId,
        name: whitelist.courseName || '十年经验二哥 灯光设计课',
        title: whitelist.courseName || '十年经验二哥 灯光设计课',
        price: 0,  // 白名单激活，价格为0
        quantity: 1,
        category: 'course'
      }],
      totalAmount: 0,
      paymentMethod: 'whitelist'
    },
    isDelete: 0,
    createdAt: now,
    updatedAt: now
  };
  
  const orderRes = await db.collection('orders').add({ data: orderDoc });
  
  // 3. 更新白名单状态
  await db.collection('course_whitelist').doc(whitelist._id).update({
    data: {
      status: 'activated',
      activatedAt: now,
      activatedUserId: openid,
      orderId: orderRes._id,
      orderNo: orderNo,
      updatedAt: now
    }
  });
  
  console.log('[getPhoneNumber] 白名单激活成功:', {
    phone: phone.substring(0, 3) + '****' + phone.substring(7),
    orderId: orderRes._id,
    orderNo
  });
  
  return { orderId: orderRes._id, orderNo };
}
```

**调用位置**：
```javascript
// 在 getPhoneNumber 云函数中，保存手机号成功后调用
if (existingUser && existingUser._id && phoneInfo.phoneNumber) {
  // ... 原有的更新手机号逻辑 ...
  
  // 🔥 新增：检查并激活白名单
  try {
    const activateResult = await checkAndActivateWhitelist(
      phoneInfo.purePhoneNumber || phoneInfo.phoneNumber,
      openid
    );
    if (activateResult) {
      console.log('[getPhoneNumber] 白名单激活完成');
    }
  } catch (activateErr) {
    // 白名单激活失败不影响登录流程
    console.error('[getPhoneNumber] 白名单激活失败（不影响登录）:', activateErr.message);
  }
}
```

---

## 四、管理后台设计

### 4.1 新增页面：`WhitelistList.tsx`

**路径**：`src/pages/content/WhitelistList.tsx`

**功能**：
1. 统计卡片（总数、待激活、已激活、激活率）
2. 文件上传导入（支持拖拽）
3. 筛选（状态、来源）
4. 搜索（手机号）
5. 列表展示（分页）
6. 模板下载

### 4.2 页面布局设计

```tsx
<PageContainer>
  {/* 统计卡片 */}
  <Row gutter={16}>
    <Col span={6}><Statistic title="总数" value={stats.totalCount} /></Col>
    <Col span={6}><Statistic title="待激活" value={stats.pendingCount} /></Col>
    <Col span={6}><Statistic title="已激活" value={stats.activatedCount} /></Col>
    <Col span={6}><Statistic title="激活率" value={stats.activationRate} suffix="%" /></Col>
  </Row>
  
  {/* 操作区 */}
  <Card>
    <Space>
      <Upload beforeUpload={handleImport}>
        <Button type="primary" icon={<UploadOutlined />}>导入白名单</Button>
      </Upload>
      <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>
    </Space>
    
    <Space style={{ float: 'right' }}>
      <Select placeholder="状态筛选" onChange={handleStatusChange}>
        <Option value="all">全部</Option>
        <Option value="pending">待激活</Option>
        <Option value="activated">已激活</Option>
      </Select>
      <Input.Search placeholder="手机号搜索" onSearch={handleSearch} />
    </Space>
  </Card>
  
  {/* 列表 */}
  <Table
    columns={columns}
    dataSource={data}
    pagination={pagination}
    loading={loading}
  />
</PageContainer>
```

### 4.3 API 服务扩展

**文件**：`src/services/api.ts`

```typescript
// ==================== 白名单管理 API ====================

export interface WhitelistRecord {
  _id: string;
  phone: string;
  phoneDisplay: string;  // 脱敏显示：138****5678
  courseId: string;
  courseName: string;
  status: 'pending' | 'activated';
  statusLabel: string;   // '待激活' | '已激活'
  source?: string;
  activatedAt?: number;
  activatedAtDisplay?: string;
  activatedUserId?: string;
  orderNo?: string;
  createdAt: number;
  createdAtDisplay: string;
}

export interface WhitelistStats {
  totalCount: number;
  pendingCount: number;
  activatedCount: number;
  activationRate: string;
}

export const whitelistApi = {
  /**
   * 获取白名单列表
   */
  async list(params: {
    limit?: number;
    offset?: number;
    status?: 'pending' | 'activated' | 'all';
    phone?: string;
    source?: string;
  }): Promise<PaginatedResponse<WhitelistRecord> & { stats: WhitelistStats }> {
    return callFunction('admin_whitelist_list', params);
  },

  /**
   * 导入白名单
   */
  async import(params: {
    fileData: string;
    fileName: string;
    source?: string;
  }): Promise<CloudResponse<{
    total: number;
    successCount: number;
    duplicateCount: number;
    invalidCount: number;
    details: {
      duplicates: string[];
      invalids: string[];
    };
  }>> {
    return callFunction('admin_whitelist_import', params);
  },

  /**
   * 删除白名单记录（仅待激活状态可删除）
   */
  async delete(id: string): Promise<CloudResponse> {
    return callFunction('admin_whitelist_delete', { id });
  },
};
```

### 4.4 路由配置

**文件**：`src/App.tsx` 或路由配置文件

```typescript
{
  path: '/content/whitelist',
  name: '课程白名单',
  icon: <SafetyOutlined />,
  component: WhitelistList,
}
```

### 4.5 导入模板设计

**Excel 模板格式**（`course_whitelist_template.xlsx`）：

| 手机号 |
|--------|
| 13812345678 |
| 13987654321 |
| ... |

**说明**：
- 第一行为标题行
- 手机号必须为 11 位数字
- 支持 `.xlsx`、`.xls`、`.csv` 格式

---

## 五、小程序端改造

### 5.1 `getPhoneNumber` 调用位置

**无需改动**，现有的手机号授权流程会自动触发白名单检查。

### 5.2 订单展示

**无需改动**，白名单激活的订单与普通订单结构一致，会自动显示在"我的订单"页面。

---

## 六、安全设计

### 6.1 权限控制

| 操作 | 权限要求 |
|------|----------|
| 导入白名单 | 管理员（roles = 0） |
| 查询白名单列表 | 管理员（roles = 0） |
| 删除白名单记录 | 管理员（roles = 0） |
| 白名单激活 | 用户授权手机号即可（自动触发） |

### 6.2 数据安全

1. **手机号脱敏**：列表展示时显示 `138****5678` 格式
2. **管理员验证**：云函数使用 `admin_auth.js` 验证管理员身份
3. **唯一索引**：防止重复导入
4. **状态校验**：只有 `pending` 状态的记录才能被激活

### 6.3 幂等性保证

```javascript
// 激活前检查状态
const whitelist = await db.collection('course_whitelist')
  .where({
    phone: phone,
    status: 'pending'  // 只查询待激活状态
  })
  .limit(1)
  .get();

// 如果已激活或不存在，直接跳过
if (!whitelist.data || whitelist.data.length === 0) {
  return null;
}
```

---

## 七、测试策略

### 7.1 单元测试

| 测试项 | 测试内容 |
|--------|----------|
| 手机号校验 | 11位数字、1开头、非空 |
| Excel 解析 | xlsx/xls/csv 格式支持 |
| 去重逻辑 | 重复手机号跳过 |
| 状态流转 | pending → activated |

### 7.2 集成测试

| 测试场景 | 预期结果 |
|----------|----------|
| 导入空文件 | 返回错误提示 |
| 导入无效手机号 | 跳过并统计 |
| 导入重复手机号 | 跳过并统计 |
| 白名单用户登录 | 自动创建订单 |
| 非白名单用户登录 | 正常登录，无订单 |
| 已激活用户再次登录 | 不重复创建订单 |
| 查看课程详情 | isPurchased = true |
| 查看我的订单 | 显示课程订单 |

### 7.3 压力测试

| 场景 | 指标 |
|------|------|
| 批量导入 1000 条 | < 30s |
| 白名单查询 | < 200ms |
| 登录激活检查 | < 500ms |

---

## 八、实施风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 手机号格式不一致 | 导入失败 | 提供格式校验和错误提示 |
| 数据库索引未建立 | 查询慢 | 部署前创建索引 |
| 白名单激活失败 | 用户无权限 | 异常捕获，不影响登录 |
| 并发激活冲突 | 重复订单 | 使用唯一索引 + 状态校验 |

---

## 九、部署清单

### 9.1 数据库操作

- [ ] 创建 `course_whitelist` 集合
- [ ] 创建索引 `idx_phone_course`（唯一）
- [ ] 创建索引 `idx_status`
- [ ] 创建索引 `idx_activated_user`
- [ ] 创建索引 `idx_created_at`

### 9.2 云函数部署

- [ ] 新增 `admin_whitelist_import`
- [ ] 新增 `admin_whitelist_list`
- [ ] 新增 `admin_whitelist_delete`（可选）
- [ ] 改造 `getPhoneNumber`

### 9.3 管理后台部署

- [ ] 新增 `WhitelistList.tsx` 页面
- [ ] 扩展 `api.ts` 服务
- [ ] 更新路由配置
- [ ] 构建并部署

---

**技术方案设计完成，请确认是否可以进入任务拆分阶段？** ✅

