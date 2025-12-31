# 🎥 课程视频压缩完整指南

## 📋 目录
1. [为什么要压缩视频](#为什么要压缩视频)
2. [HandBrake 使用教程（推荐）](#handbrake-使用教程)
3. [FFmpeg 批量处理](#ffmpeg-批量处理)
4. [压缩参数详解](#压缩参数详解)
5. [上传替换流程](#上传替换流程)
6. [效果验证](#效果验证)

---

## 为什么要压缩视频

### 当前问题
- ❌ 长视频（1小时）文件大小 ~900MB
- ❌ 初始缓冲时间长（30-60秒）
- ❌ 拖动进度条响应慢
- ❌ 流量消耗大

### 压缩后效果
- ✅ 文件大小减少 70%（900MB → 250MB）
- ✅ 初始缓冲时间短（5-10秒）
- ✅ 拖动进度条流畅
- ✅ 节省流量和存储

---

## HandBrake 使用教程

### 1. 下载安装

**官网下载**：https://handbrake.fr/downloads.php

- Windows：下载 `.exe` 安装程序
- Mac：下载 `.dmg` 安装包

### 2. 快速压缩（单个视频）

#### 步骤 1：打开视频
1. 启动 HandBrake
2. 点击 **"Open Source"** → **"File"**
3. 选择要压缩的视频

#### 步骤 2：选择预设
在右侧预设列表中选择：
```
Fast 720p30
```

#### 步骤 3：设置输出
1. 点击下方 **"Browse"** 按钮
2. 选择保存位置
3. 文件命名建议：`原文件名_compressed.mp4`

#### 步骤 4：开始压缩
点击顶部 **"Start"** 绿色按钮，等待完成。

**压缩时间**：
- 18分钟视频：5-10 分钟
- 1小时视频：15-30 分钟

### 3. 批量压缩

#### 方法一：使用队列功能

1. **添加所有视频**
   - 打开第一个视频
   - 设置预设为 "Fast 720p30"
   - 点击 **"Add to Queue"**
   - 继续添加其他视频

2. **查看队列**
   - 点击顶部 **"Queue"** 按钮
   - 查看所有待处理视频

3. **批量开始**
   - 点击 **"Start Queue"**
   - 所有视频依次处理

#### 方法二：使用预设保存（推荐）

1. **创建自定义预设**
   - 打开任意视频
   - 在 **"Video"** 标签设置：
     - Quality: RF 23
     - Preset: Medium
   - 点击底部 **"Presets"** → **"Add"**
   - 命名：`课程视频压缩`

2. **批量应用**
   - 每次打开新视频
   - 选择自定义预设
   - 添加到队列

---

## FFmpeg 批量处理

### 1. 安装 FFmpeg

#### Windows
```powershell
# 使用 Chocolatey（推荐）
choco install ffmpeg

# 或手动下载
# 访问：https://www.gyan.dev/ffmpeg/builds/
# 下载 ffmpeg-release-essentials.7z
# 解压到 C:\ffmpeg
# 添加到系统环境变量
```

#### Mac
```bash
brew install ffmpeg
```

### 2. 批量压缩脚本

#### Windows PowerShell

创建文件 `compress-videos.ps1`：

```powershell
# 压缩当前目录下所有 .mp4 和 .mov 文件

Get-ChildItem "*.mp4", "*.mov" | ForEach-Object {
    $output = $_.DirectoryName + "\" + $_.BaseName + "_compressed.mp4"
    
    Write-Host "正在压缩: $($_.Name)" -ForegroundColor Green
    
    ffmpeg -i $_.FullName `
        -c:v h264 `
        -preset medium `
        -crf 23 `
        -c:a aac `
        -b:a 128k `
        $output
    
    Write-Host "完成: $output" -ForegroundColor Cyan
}

Write-Host "所有视频压缩完成！" -ForegroundColor Green
```

运行：
```powershell
cd 视频目录
.\compress-videos.ps1
```

#### Mac/Linux Bash

创建文件 `compress-videos.sh`：

```bash
#!/bin/bash

echo "🎥 开始批量压缩视频..."

for file in *.mp4 *.mov; do
    [ -f "$file" ] || continue
    
    filename="${file%.*}"
    output="${filename}_compressed.mp4"
    
    echo "📹 正在压缩: $file"
    
    ffmpeg -i "$file" \
        -c:v h264 \
        -preset medium \
        -crf 23 \
        -c:a aac \
        -b:a 128k \
        "$output"
    
    echo "✅ 完成: $output"
done

echo "🎉 所有视频压缩完成！"
```

运行：
```bash
chmod +x compress-videos.sh
cd 视频目录
./compress-videos.sh
```

---

## 压缩参数详解

### 推荐参数（课程视频）

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| **分辨率** | 1280x720 | 移动端清晰度足够 |
| **帧率** | 30fps | 课程视频无需60fps |
| **视频编码** | H.264 | 兼容性最好 |
| **质量 (CRF)** | 23 | 22-24适中，值越大越小 |
| **预设** | Medium | 平衡速度和质量 |
| **音频编码** | AAC | 标准音频编码 |
| **音频比特率** | 128 kbps | 语音课程足够 |

### CRF 质量参数对照

| CRF 值 | 文件大小 | 质量 | 适用场景 |
|--------|---------|------|----------|
| 18-20 | 大 | 极高 | 专业制作 |
| **22-24** | **中** | **高** | **在线课程（推荐）** |
| 26-28 | 小 | 中 | 移动网络 |
| 30+ | 极小 | 低 | 不推荐 |

---

## 上传替换流程

### 1. 准备压缩后的视频

将压缩后的视频放到项目目录：
```
20250925-miniprogram-4/
  └─ compressed-videos/
     ├─ 1-1-灯光设计基础_compressed.mp4
     ├─ 2-1-软件介绍_compressed.mp4
     ├─ 3-2-PS设计课_compressed.mp4
     └─ ...
```

### 2. 查看上传计划

运行脚本查看上传配置：
```bash
cd 20250925-miniprogram-4
node scripts/upload-compressed-videos.js
```

### 3. 使用 MCP 工具上传

对每个视频执行：

```javascript
// 示例：上传 1.1 灯光设计基础
mcp_cloudbase_manageStorage({
  action: "upload",
  localPath: "C:/path/to/compressed-videos/1-1-灯光设计基础_compressed.mp4",
  cloudPath: "灯光课程-¥999｜二哥十年经验的灯光课（正课）/第1课｜灯光设计基本原则/课程视频/视频-带字幕｜灯光设计基础.mp4",
  isDirectory: false,
  force: true  // 覆盖原文件
})
```

### 4. 等待 CDN 缓存刷新

上传完成后：
- ⏱️ CDN 缓存刷新需要 5-10 分钟
- 💡 建议：在 URL 后添加随机参数测试新版本
  ```
  https://xxx.tcb.qcloud.la/video.mp4?v=20250101
  ```

---

## 效果验证

### 1. 本地验证

压缩完成后，在本地播放器测试：
- ✅ 画面清晰度
- ✅ 声音质量
- ✅ 播放流畅性

### 2. 小程序验证

上传后测试：
1. 清除小程序缓存
2. 重新进入课程播放页
3. 测试以下功能：
   - 初始加载速度
   - 拖动进度条响应
   - 全屏播放
   - 切换清晰度（如果有）

### 3. 数据对比

| 指标 | 压缩前 | 压缩后 | 改善 |
|------|--------|--------|------|
| 文件大小 | 900MB | 250MB | 72% ↓ |
| 初始缓冲 | 30-60秒 | 5-10秒 | 80% ↓ |
| 拖动响应 | 慢（5-10秒） | 快（1-2秒） | 70% ↓ |
| 流量消耗 | 900MB/次 | 250MB/次 | 72% ↓ |

---

## 常见问题

### Q1: 压缩会降低画质吗？
**A**: 使用 CRF 23 参数，移动端观看几乎无差异。720p 分辨率对于课程视频完全足够。

### Q2: 压缩需要多长时间？
**A**: 取决于视频长度和电脑性能：
- 普通笔记本：1 小时视频约 15-30 分钟
- 高性能电脑：1 小时视频约 10-15 分钟

### Q3: 可以压缩得更小吗？
**A**: 可以，但不推荐。参数建议：
- CRF 提高到 25-26（会明显降低画质）
- 分辨率降到 960x540（移动端可接受）
- 帧率降到 24fps（动画类课程不适合）

### Q4: 压缩后能恢复吗？
**A**: 不能。视频压缩是不可逆过程，建议：
- ✅ 保留原始视频备份
- ✅ 先压缩测试一个视频
- ✅ 确认效果满意后再批量处理

### Q5: 上传后还是卡顿？
**A**: 检查以下几点：
- 确认已上传压缩后的版本
- 清除小程序缓存
- 等待 CDN 缓存刷新（5-10分钟）
- 测试网络环境

---

## 推荐工作流程

### 第一次（测试）
1. 选择 1 个长视频（如 1.1 灯光设计基础）
2. 使用 HandBrake 压缩
3. 本地播放验证质量
4. 上传到云存储
5. 小程序测试加载速度

### 确认效果后（批量）
1. 使用 HandBrake 队列或 FFmpeg 脚本
2. 批量压缩所有长视频（>30分钟）
3. 依次上传替换
4. 全面测试

---

## 需要帮助？

如果在压缩过程中遇到问题，请告诉我：
- 使用的工具和版本
- 具体的错误信息
- 视频的原始格式和大小

我会提供详细的解决方案 😊

---

**文档更新时间**：2025-01-01
**适用版本**：HandBrake 1.7+, FFmpeg 6.0+

