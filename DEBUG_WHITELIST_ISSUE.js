/**
 * 调试白名单删除后仍可观看课程的问题
 * 用户手机号：19854562428
 * 
 * 在微信开发者工具 Console 中执行这些命令
 */

// ========== 步骤 1：清除本地缓存 ==========
function clearAllCache() {
  console.log('🗑️ 清除所有本地缓存...');
  
  // 清除所有 Storage
  wx.clearStorageSync();
  
  console.log('✅ 缓存已清除');
  console.log('📱 重启小程序...');
  
  // 重启小程序
  setTimeout(() => {
    wx.reLaunch({ url: '/pages/products/products' });
  }, 1000);
}

// ========== 步骤 2：查询当前 OPENID ==========
async function getMyOpenid() {
  console.log('🔍 查询当前用户 OPENID...');
  
  try {
    const res = await wx.cloud.callFunction({
      name: 'login',
      data: {}
    });
    
    console.log('========== 用户身份信息 ==========');
    console.log('OPENID:', res.result.openid);
    console.log('UnionID:', res.result.unionId || '无');
    console.log('用户记录:', res.result.user);
    console.log('====================================');
    
    return res.result.openid;
  } catch (err) {
    console.error('❌ 查询失败:', err);
    return null;
  }
}

// ========== 步骤 3：查询所有购买记录 ==========
async function checkAllPurchaseRecords(phone = '19854562428') {
  console.log('🔍 查询手机号相关的所有购买记录...');
  console.log('手机号:', phone);
  console.log('');
  
  try {
    // 调用云函数查询
    const res = await wx.cloud.callFunction({
      name: 'debug_purchase_records',
      data: { phone, courseId: 'CO_DEFAULT_001' }
    });
    
    if (res.result && res.result.success) {
      const data = res.result.data;
      
      console.log('========== 查询结果 ==========');
      console.log('');
      
      // 白名单记录
      console.log('📋 白名单记录 (course_whitelist):');
      if (data.whitelist && data.whitelist.length > 0) {
        console.log(`  ⚠️ 找到 ${data.whitelist.length} 条白名单记录：`);
        data.whitelist.forEach((item, index) => {
          console.log(`  ${index + 1}.`, {
            _id: item._id,
            status: item.status,
            phone: item.phone,
            courseId: item.courseId,
            activatedAt: item.activatedAt
          });
        });
      } else {
        console.log('  ✅ 无白名单记录（正常）');
      }
      console.log('');
      
      // 订单记录
      console.log('📦 订单记录 (orders):');
      if (data.orders && data.orders.length > 0) {
        console.log(`  ⚠️ 找到 ${data.orders.length} 条订单记录：`);
        data.orders.forEach((item, index) => {
          console.log(`  ${index + 1}.`, {
            _id: item._id,
            orderId: item.orderId,
            status: item.status,
            payStatus: item.payStatus,
            courseId: item.items?.[0]?.id
          });
        });
      } else {
        console.log('  ✅ 无订单记录');
      }
      console.log('');
      
      // 学习进度记录
      console.log('📊 学习进度记录 (user_course_progress):');
      if (data.progress && data.progress.length > 0) {
        console.log(`  找到 ${data.progress.length} 条进度记录：`);
        data.progress.forEach((item, index) => {
          console.log(`  ${index + 1}.`, {
            _id: item._id,
            courseId: item.courseId,
            progress: item.progress,
            completedLessons: item.completedLessons?.length || 0
          });
        });
      } else {
        console.log('  无进度记录');
      }
      console.log('');
      
      console.log('====================================');
      console.log('');
      
      // 分析结果
      if (data.whitelist.length > 0 || data.orders.length > 0) {
        console.log('🎯 问题原因：');
        if (data.whitelist.length > 0) {
          console.log('  ❌ 白名单记录仍然存在！');
          console.log('  ❌ 你可能删除了一条，但还有其他记录');
        }
        if (data.orders.length > 0) {
          console.log('  ❌ 订单记录存在！');
          console.log('  ❌ 即使删除白名单，订单记录也会让你能观看');
        }
        console.log('');
        console.log('💡 解决方案：');
        console.log('  使用 deleteAllPurchaseRecords() 删除所有相关记录');
      } else {
        console.log('✅ 所有购买记录已清除');
        console.log('💡 如果还能观看，请清除缓存：clearAllCache()');
      }
      
      return data;
    }
  } catch (err) {
    console.error('❌ 查询失败:', err);
    console.log('');
    console.log('⚠️ 云函数 debug_purchase_records 可能不存在');
    console.log('💡 请先部署该云函数');
    return null;
  }
}

// ========== 步骤 4：删除所有购买记录 ==========
async function deleteAllPurchaseRecords(phone = '19854562428', confirm = false) {
  if (!confirm) {
    console.log('⚠️ 此操作将删除所有相关的购买记录！');
    console.log('⚠️ 包括：白名单、订单、学习进度');
    console.log('');
    console.log('💡 如果确认删除，请执行：');
    console.log(`   deleteAllPurchaseRecords('${phone}', true)`);
    return;
  }
  
  console.log('🗑️ 删除所有购买记录...');
  console.log('手机号:', phone);
  console.log('');
  
  try {
    const res = await wx.cloud.callFunction({
      name: 'debug_purchase_records',
      data: { 
        phone, 
        courseId: 'CO_DEFAULT_001',
        action: 'delete'
      }
    });
    
    if (res.result && res.result.success) {
      console.log('========== 删除结果 ==========');
      console.log('白名单:', res.result.deletedWhitelist, '条');
      console.log('订单:', res.result.deletedOrders, '条');
      console.log('学习进度:', res.result.deletedProgress, '条');
      console.log('====================================');
      console.log('');
      console.log('✅ 删除成功！');
      console.log('📱 请清除缓存并重启：clearAllCache()');
    }
  } catch (err) {
    console.error('❌ 删除失败:', err);
  }
}

// ========== 步骤 5：测试课程访问 ==========
async function testCourseAccess(courseId = 'CO_DEFAULT_001') {
  console.log('🧪 测试课程访问权限...');
  console.log('');
  
  try {
    const res = await wx.cloud.callFunction({
      name: 'course_purchase_check',
      data: { courseId }
    });
    
    console.log('========== 课程权限检查结果 ==========');
    console.log('课程ID:', courseId);
    console.log('是否购买:', res.result.data.isPurchased ? '✅ 是' : '❌ 否');
    console.log('学习进度:', res.result.data.progress || 0, '%');
    console.log('返回数据:', res.result.data);
    console.log('=========================================');
    console.log('');
    
    if (res.result.data.isPurchased) {
      console.log('⚠️ 仍然可以访问课程！');
      console.log('💡 请运行 checkAllPurchaseRecords() 查看原因');
    } else {
      console.log('✅ 已无法访问课程（权限清除成功）');
    }
    
    return res.result.data;
  } catch (err) {
    console.error('❌ 测试失败:', err);
    return null;
  }
}

// ========== 完整调试流程 ==========
async function fullDebug(phone = '19854562428') {
  console.log('\n');
  console.log('🔍 ========== 开始完整调试 ==========');
  console.log('用户手机号:', phone);
  console.log('');
  
  // 1. 获取 OPENID
  console.log('【步骤 1】获取用户 OPENID');
  const openid = await getMyOpenid();
  console.log('');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 2. 测试当前权限
  console.log('【步骤 2】测试当前课程访问权限');
  await testCourseAccess();
  console.log('');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 3. 查询所有购买记录
  console.log('【步骤 3】查询所有购买记录');
  await checkAllPurchaseRecords(phone);
  console.log('');
  
  console.log('🎯 ========== 调试完成 ==========');
  console.log('');
  console.log('📋 后续操作：');
  console.log('1. 如果发现购买记录，使用 deleteAllPurchaseRecords() 删除');
  console.log('2. 删除后清除缓存：clearAllCache()');
  console.log('3. 重新测试：testCourseAccess()');
  console.log('');
}

// ========== 快捷命令说明 ==========
console.log('\n');
console.log('🔍 ========== 白名单调试命令 ==========');
console.log('');
console.log('【快速开始】');
console.log('fullDebug()              - 运行完整调试流程');
console.log('');
console.log('【分步调试】');
console.log('1. getMyOpenid()         - 查询当前 OPENID');
console.log('2. testCourseAccess()    - 测试课程访问权限');
console.log('3. checkAllPurchaseRecords() - 查询所有购买记录');
console.log('4. deleteAllPurchaseRecords() - 删除所有购买记录');
console.log('5. clearAllCache()       - 清除本地缓存');
console.log('');
console.log('【推荐流程】');
console.log('① fullDebug()            - 先运行完整调试');
console.log('② 根据结果决定是否删除记录');
console.log('③ 删除后清除缓存并重新测试');
console.log('');
console.log('==========================================');
console.log('\n');

// 导出到全局
window.clearAllCache = clearAllCache;
window.getMyOpenid = getMyOpenid;
window.checkAllPurchaseRecords = checkAllPurchaseRecords;
window.deleteAllPurchaseRecords = deleteAllPurchaseRecords;
window.testCourseAccess = testCourseAccess;
window.fullDebug = fullDebug;

