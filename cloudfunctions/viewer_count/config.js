/**
 * 配置常量
 */
module.exports = {
  // 数据库集合名称
  COLLECTION_NAME: 'viewer_records',
  
  // 活跃超时时间（5分钟，单位：毫秒）
  ACTIVE_TIMEOUT: 5 * 60 * 1000,
  
  // 清理间隔（10分钟，单位：毫秒）
  CLEANUP_INTERVAL: 10 * 60 * 1000
};

