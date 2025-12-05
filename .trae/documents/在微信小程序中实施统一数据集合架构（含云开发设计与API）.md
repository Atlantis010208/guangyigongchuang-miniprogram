## 现有集合（已在项目中使用）
- users：用户档案与地址；来源于云函数 login 与多页面读写。
- orders：设计服务与商城订单统一入库；多页面 add/update/remove。

## 必须创建/完善的集合
### users（保留并补完字段与索引）
- 字段：_id、_openid、nickname、phoneNumber、avatarUrl、addresses[]、depositPaid、createdAt、updatedAt。
- 索引：_openid（唯一/普通）、updatedAt（普通）。
- 权限：仅创建者可读写；管理员（云函数）可写。

### orders（保留并补完字段与索引）
- 字段：_id、orderNo、type(goods|products)、category(publish|selection|optimize|mall|residential|commercial|office|custom)、status、paid、paidAt、userId、items[]/params、snapshots、createdAt、updatedAt、deleted。
- 索引：orderNo（唯一）、userId+createdAt（复合）、status、category、type（普通）。
- 权限：仅创建者可读写；支付相关字段仅云函数更新。

## 建议新增集合（按需启用）
### requests（将本地 lighting_requests 上云）
- 用途：统一管理设计服务请求与工作流状态。
- 字段：_id、orderNo、category、params(object)、userId、status(flow: pending|confirmed|designer_accepted|submitted|completed|canceled)、notes、createdAt、updatedAt。
- 索引：userId+createdAt、orderNo、status。
- 权限：仅创建者可读写；设计师/管理员通过云函数写。

### products（商城商品目录）
- 字段：_id、sku、title、cover、images[]、price、specs(object)、categoryId、stock、enabled、updatedAt。
- 索引：sku（唯一）、categoryId、enabled。
- 权限：所有人可读；管理员可写（云函数或后台）。

### categories（商品/方案分类）
- 字段：_id、name、slug、icon、sort、parentId、updatedAt。
- 索引：slug（唯一）、parentId、sort。
- 权限：所有人可读；管理员可写。

### transactions / deposits（支付与押金流水）
- 字段：_id、userId、orderNo、type(deposit|order_payment|refund)、amount、status(pending|paid|failed|refunded)、paidAt、providerTxnId、meta。
- 索引：userId+createdAt、orderNo、status。
- 权限：仅创建者可读；写与状态更新通过云函数。

### notifications（应用内事件通知，配合 watch）
- 字段：_id、userId、type(order_update|designer_message|system)、payload、read、createdAt。
- 索引：userId+createdAt、read。
- 权限：仅创建者可读写；系统生成通过云函数。

### surveys（活动/问卷提交）
- 字段：_id、activityId、userId、answers(object)、submittedAt、status。
- 索引：activityId、userId+submittedAt。
- 权限：仅创建者可读；管理员可读写。

## 规则与集成要点
- 集合权限：产品/分类开放只读；用户/订单/请求/交易严格“仅创建者可读写”，敏感写操作经云函数。
- 实时通知：在 orders、requests 上使用 watch 进行列表/用户维度的变更推送，驱动 UI 与缓存更新。
- 索引与性能：为高频查询字段建立索引；列表查询采用 where+orderBy+limit；避免监听超 5000 条；分页与投影按需控制。
- 渐进迁移：
  - 将本地 lighting_requests 迁移到 requests 集合；保留本地作为离线缓存。
  - 订单/用户页面改用统一仓库层封装；支付与资料写入经云函数。

## 参考文档
- 云数据库与 CRUD 能力：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/database.html
- 实时数据库 watch 能力与限制：https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/database/realtime.html
- 云开发能力概览与示例：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/capabilities.html
