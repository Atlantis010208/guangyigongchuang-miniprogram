/**
 * 更新课程视频地址脚本
 * 
 * 使用方法：
 * 1. 在微信开发者工具中打开项目
 * 2. 右键点击云函数 admin_update_video_urls，选择"上传并部署：云端安装依赖"
 * 3. 部署完成后，在开发者工具的控制台中复制粘贴以下代码运行：
 * 
 * wx.cloud.callFunction({
 *   name: 'admin_update_video_urls',
 *   data: {
 *     courseId: 'CO_DEFAULT_001'
 *   }
 * }).then(res => {
 *   console.log('✅ 视频地址更新成功:', res)
 * }).catch(err => {
 *   console.error('❌ 更新失败:', err)
 * })
 * 
 * 
 * 更新的视频地址映射：
 * - 1.1 灯光设计基础: cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-带字幕｜灯光设计基础(1).mp4
 * - 2.1 灯光设计软件介绍: cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/灯光设计软件(1).mp4
 * - 3.2 Ps灯光设计初稿彩屏图和手绘图设计课: cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕丨3-1Ps灯光设计初稿彩屏图和手绘图设计课.mp4
 * - 3.3 灯光设计概念方案汇报方案制作课: cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/3-2-Ps灯光设计初稿和手绘图设计课.mp4
 * - 3.4 灯光深化设计施工图纸CAD绘制课: cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕｜灯光设计实操-灯光深化设计施工图纸cad绘制课.mp4
 */

// 云函数代码已创建在: cloudfunctions/admin_update_video_urls/
// 请按照上述步骤操作

