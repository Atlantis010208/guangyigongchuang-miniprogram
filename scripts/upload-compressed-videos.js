/**
 * 上传压缩后的视频到云存储
 * 使用前请确保已压缩视频文件
 * 
 * 使用方法：
 * 1. 将压缩后的视频放到 compressed-videos 目录
 * 2. 运行: node scripts/upload-compressed-videos.js
 */

const fs = require('fs');
const path = require('path');

// 配置：压缩视频与云存储路径的映射
const VIDEO_MAPPING = [
  {
    localPath: './compressed-videos/1-1-灯光设计基础_compressed.mp4',
    cloudPath: '灯光课程-¥999｜二哥十年经验的灯光课（正课）/第1课｜灯光设计基本原则/课程视频/视频-带字幕｜灯光设计基础.mp4',
    lessonId: 'l1-1'
  },
  {
    localPath: './compressed-videos/2-1-灯光设计软件介绍_compressed.mp4',
    cloudPath: '灯光课程-¥999｜二哥十年经验的灯光课（正课）/第2课｜灯光设计软件介绍/第二课｜灯光设计软件介绍课程视频/灯光设计软件.mp4',
    lessonId: 'l2-1'
  },
  {
    localPath: './compressed-videos/3-2-PS设计课_compressed.mp4',
    cloudPath: '灯光课程-¥999｜二哥十年经验的灯光课（正课）/第3课丨灯光设计实操/3-1｜灯光设计实操- PS灯光设计初稿彩屏图和手绘图设计课/视频-剪辑-带字幕丨3-1PS灯光设计初稿彩屏图和手绘图设计课.mp4',
    lessonId: 'l3-2'
  }
  // 可以继续添加更多视频...
];

console.log('🎥 视频上传准备中...\n');
console.log('📋 待上传视频列表：');
VIDEO_MAPPING.forEach((item, index) => {
  const exists = fs.existsSync(item.localPath);
  const status = exists ? '✅' : '❌ 未找到';
  console.log(`${index + 1}. ${status} ${path.basename(item.localPath)}`);
});

console.log('\n📝 上传说明：');
console.log('1. 确保压缩后的视频已放到 compressed-videos 目录');
console.log('2. 文件名与上面配置的 localPath 一致');
console.log('3. 使用 MCP 工具手动上传：');
console.log('   - 调用 mcp_cloudbase_manageStorage');
console.log('   - action: "upload"');
console.log('   - 使用绝对路径');
console.log('\n示例命令见下方 👇\n');

// 生成上传命令示例
VIDEO_MAPPING.forEach((item, index) => {
  console.log(`// 上传视频 ${index + 1}:`);
  console.log(`mcp_cloudbase_manageStorage({`);
  console.log(`  action: "upload",`);
  console.log(`  localPath: "${path.resolve(item.localPath)}",`);
  console.log(`  cloudPath: "${item.cloudPath}",`);
  console.log(`  isDirectory: false,`);
  console.log(`  force: true`);
  console.log(`})\n`);
});

console.log('⚠️ 注意：');
console.log('- 上传会覆盖原视频');
console.log('- 建议先备份原视频（如果需要）');
console.log('- 上传完成后需要等待 CDN 缓存刷新（约5-10分钟）');

