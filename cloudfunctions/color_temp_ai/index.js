const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const { retrieve } = require('./lib/rag')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })
// timeout: 60s —— bigmodel-custom 网关首包偶发 >15s，默认 15s 会触发 ESOCKETTIMEDOUT
const app = tcb.init({ env: 'cloud1-5gb9c5u2c58ad6d7', timeout: 60000 })

const db = cloud.database()
const kbDb = app.database() // 用管理员身份访问 color_temp_knowledge（绕过小程序端安全规则）

// 默认 Prompt 模板（降级方案）
const DEFAULT_PROMPT = `你是一名拥有 15 年经验的专业灯光设计师，曾参与超过 500 个住宅及商业照明项目。
现在需要你根据客户提供的信息，给出科学、专业且实用的色温方案建议。

## 客户信息
- 空间类型：\${space}
- 建议色温：\${suggestedTemp}
- 使用人群：\${age}
- 主要用途：\${usage}
- 灯具配置：\${fixtures}

## 你的专业知识储备
1. 色温标准档位只有：2700K、3000K、3500K、4000K、4500K、5000K（推荐结果必须是其中之一）
2. 2700K = 暖黄光（像烛光），适合卧室助眠、浪漫氛围
3. 3000K = 暖白光，适合客厅、餐厅，温馨舒适
4. 3500K = 自然偏暖光，适合多功能空间
5. 4000K = 自然白光，适合厨房、书房、办公，明亮清晰
6. 4500K-5000K = 冷白光，适合需要高度专注的工作区域
7. 儿童房主灯不应低于 3000K，推荐 3500-4000K 保护视力
8. 老年人房间不应超过 3500K，避免蓝光刺激
9. 卫生间、衣帽间需要 3500K 以上保证辨色准确
10. 同一空间不同灯具色温差不超过 500K
11. 氛围灯（灯带/壁灯）通常比主灯低 300-500K
12. 作业灯（台灯/镜前灯）通常比主灯高 300-500K
13. 显色指数 Ra≥90 比色温更影响视觉舒适度

## 输出要求
请严格按以下 JSON 格式返回，不要包含任何 JSON 以外的文字、不要用 markdown 代码块包裹：
{
  "recommendedTemp": 3500,
  "tempDesc": "一个通俗易懂的色温描述，让普通用户能理解",
  "layers": [
    {
      "name": "具体灯具名称（如吸顶灯/筒灯/面板灯）",
      "label": "照明层类型（基础照明/氛围照明/重点照明/作业照明）",
      "temp": 3500,
      "desc": "一句话说明为什么推荐这个色温，要通俗易懂"
    }
  ],
  "tips": [
    "3-5条专业但通俗的灯光建议，每条不超过40字",
    "要结合客户的具体空间和人群给出针对性建议",
    "避免泛泛而谈，要有实用价值"
  ],
  "reasoning": "2-3句话解释你的推荐理由，要专业但让普通人也能看懂"
}

注意事项：
- recommendedTemp 必须是标准档位之一（2700/3000/3500/4000/4500/5000）
- layers 数组中每个灯具的 temp 也必须是标准档位之一
- layers 根据客户选择的所有灯具给出对应建议，每种灯具一条
- tips 要有针对性，结合空间类型和人群特点
- 只输出 JSON，不要输出任何其他内容`

// 构造专业灯光设计师 Prompt（优先从数据库读取，降级使用默认模板）
async function buildPrompt(params) {
  const { space, suggestedTemp, age, usage, fixtures } = params

  // 尝试从数据库读取 Prompt 模板
  let template = DEFAULT_PROMPT
  try {
    const { data } = await db.collection('color_temp_config').doc('global_config').get()
    if (data && data.aiPrompt && data.aiPrompt.trim()) {
      template = data.aiPrompt
      console.log('[色温AI] 使用云端 Prompt 模板')
    } else {
      console.log('[色温AI] 云端 Prompt 为空，使用默认模板')
    }
  } catch (err) {
    console.warn('[色温AI] 读取云端 Prompt 失败，使用默认模板:', err.message)
  }

  // 替换占位符
  return template
    .replace(/\$\{space\}/g, space || '未指定')
    .replace(/\$\{area\}/g, '未提供')
    .replace(/\$\{suggestedTemp\}/g, suggestedTemp ? suggestedTemp + 'K' : '未提供')
    .replace(/\$\{targetLux\}/g, suggestedTemp ? suggestedTemp + 'K' : '未提供')
    .replace(/\$\{age\}/g, age || '未指定')
    .replace(/\$\{usage\}/g, usage || '日常起居')
    .replace(/\$\{fixtures\}/g, fixtures || '吸顶灯/筒灯')
    .replace(/\$\{primaryFixture\}/g, fixtures || '吸顶灯/筒灯')
    .replace(/\$\{secondaryFixture\}/g, '无')
}

exports.main = async (event) => {
  try {
    const {
      spaceName,
      suggestedTemp,
      ageName,
      usageName,
      fixtureNames,
      primaryFixtureName
    } = event || {}

    if (!spaceName) {
      return { success: false, error: '请选择空间类型' }
    }

    // 灯具参数：优先使用新的 fixtureNames 数组，兼容旧的 primaryFixtureName
    const fixturesStr = Array.isArray(fixtureNames) && fixtureNames.length > 0
      ? fixtureNames.join('、')
      : (primaryFixtureName || '')

    let prompt = await buildPrompt({
      space: spaceName,
      suggestedTemp: suggestedTemp,
      age: ageName,
      usage: usageName,
      fixtures: fixturesStr
    })

    // === RAG 检索：注入参考案例上下文 ===
    let references = []
    try {
      references = await retrieve(
        kbDb,
        { spaceName, ageName, usageName, fixtureNames, suggestedTemp },
        process.env.ZHIPU_API_KEY,
        { topK: 3, minScore: 0.3, timeoutMs: 2000 }
      )
      if (references.length > 0) {
        const refBlock = references
          .map((r, i) => `### 案例 ${i + 1}：${r.title}\n${r.text}`)
          .join('\n\n')
        prompt += `\n\n## 参考案例（来自二哥实战文档，请结合场景灵活运用，不要照抄）\n${refBlock}`
        console.log(`[色温AI] 注入 ${references.length} 条参考案例到 prompt`)
      } else {
        console.log('[色温AI] RAG 无命中，走原流程（降级）')
      }
    } catch (ragErr) {
      console.warn('[色温AI] RAG 调用异常，降级:', ragErr.message)
      references = []
    }

    // === 模型降级链：glm-5.1（主） → glm-4.5-air（兜底） ===
    // 两者同属 Coding Plan 覆盖，无额外计费；air 版本更快更稳
    const ai = app.ai()
    const model = ai.createModel('bigmodel-custom')

    async function runModel(modelName) {
      const stream = await model.streamText({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        enable_thinking: false
      })
      let text = ''
      for await (const chunk of stream.textStream) text += chunk
      const usage = await stream.usage
      return { text, usage }
    }

    let aiText = ''
    let usage = null
    let usedModel = 'glm-5.1'
    try {
      const res = await runModel('glm-5.1')
      aiText = res.text
      usage = res.usage
    } catch (mainErr) {
      console.warn('[色温AI] glm-5.1 调用失败，降级到 glm-4.5-air:', mainErr.message)
      usedModel = 'glm-4.5-air'
      try {
        const res = await runModel('glm-4.5-air')
        aiText = res.text
        usage = res.usage
        console.log('[色温AI] 兜底模型 glm-4.5-air 调用成功')
      } catch (fallbackErr) {
        console.error('[色温AI] 兜底模型 glm-4.5-air 仍失败:', fallbackErr.message)
        throw fallbackErr
      }
    }
    
    // 尝试提取 JSON（AI 可能返回 markdown 代码块包裹的 JSON）
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('AI 返回内容无法解析为 JSON:', aiText)
      return { success: false, error: 'AI 返回格式异常，请重试', fallback: true }
    }

    let aiResult
    try {
      aiResult = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error('JSON 解析失败:', parseErr, jsonMatch[0])
      return { success: false, error: 'AI 返回格式异常，请重试', fallback: true }
    }

    // 校验必要字段
    const validTemps = [2700, 3000, 3500, 4000, 4500, 5000]
    if (!validTemps.includes(aiResult.recommendedTemp)) {
      // 吸附到最近的标准档位
      let closest = validTemps[0]
      let minDiff = Math.abs(aiResult.recommendedTemp - closest)
      for (const t of validTemps) {
        const diff = Math.abs(aiResult.recommendedTemp - t)
        if (diff < minDiff) { minDiff = diff; closest = t }
      }
      aiResult.recommendedTemp = closest
    }

    // 校验每个 layer 的色温
    if (aiResult.layers && Array.isArray(aiResult.layers)) {
      aiResult.layers.forEach(layer => {
        if (!validTemps.includes(layer.temp)) {
          let closest = validTemps[0]
          let minDiff = Math.abs(layer.temp - closest)
          for (const t of validTemps) {
            const diff = Math.abs(layer.temp - t)
            if (diff < minDiff) { minDiff = diff; closest = t }
          }
          layer.temp = closest
        }
      })
    }

    return {
      success: true,
      data: {
        standardTemp: aiResult.recommendedTemp,
        desc: aiResult.tempDesc || '',
        layers: aiResult.layers || [],
        tips: aiResult.tips || [],
        reasoning: aiResult.reasoning || '',
        references: references.map(r => ({
          docId: r.docId,
          title: r.title,
          summary: (r.text || '').slice(0, 120),
          score: r.score
        })),
        model: usedModel  // 当前实际使用的模型（便于前端/日志排查）
      },
      usage
    }

  } catch (err) {
    console.error('color_temp_ai 云函数错误:', err)
    return {
      success: false,
      error: err.message || '服务异常',
      fallback: true
    }
  }
}
