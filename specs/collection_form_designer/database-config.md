# CloudBase 数据库配置（待部署）

本文件是部署输入，不代表配置已经应用到线上。三个集合均只允许云函数访问，客户端数据库 SDK 不应获得直接读写权限。

## 集合与安全规则

| 集合 | 客户端读 | 客户端写 | 访问入口 |
| --- | --- | --- | --- |
| `collection_form_templates` | 禁止 | 禁止 | `admin_collection_forms`、`collection_form_public` |
| `collection_form_versions` | 禁止 | 禁止 | 三个本功能云函数 |
| `collection_form_submissions` | 禁止 | 禁止 | `collection_form_public`、`admin_collection_form_submissions` |

在 CloudBase 控制台为每个集合设置安全规则：

```json
{ "read": false, "write": false }
```

## 索引

部署前创建并等待下列索引生效：

- `collection_form_templates`：`spaceType` 升序（唯一性由固定文档 ID 保证）。
- `collection_form_versions`：`spaceType` 升序、`source` 升序、`version` 降序。
- `collection_form_submissions`：
  - `createdAt` 降序；
  - `spaceType` 升序、`createdAt` 降序；
  - `spaceType` 升序、`templateVersion` 升序、`createdAt` 降序；
  - `searchText` 不建立普通索引，第一版关键词使用正则并要求配合空间类型/日期缩小范围。

发布版本文档只由 `admin_collection_forms.publish` 创建。本轮不提供删除、覆盖或回滚接口。
