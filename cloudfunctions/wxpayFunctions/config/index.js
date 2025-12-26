/**
 * 微信支付V3配置管理模块
 * 所有敏感配置从环境变量读取
 * 
 * 环境变量配置说明：
 * - WX_APPID: 小程序 AppID
 * - WX_MCHID: 商户号
 * - WX_SERIAL_NO: 商户API证书序列号
 * - WX_PRIVATE_KEY: 商户API私钥（PEM格式，换行符用 \\n 表示）
 * - WX_APIV3_KEY: APIv3密钥（32位字符串）
 */

// 获取环境变量
const getEnvVar = (key, required = true) => {
  const value = process.env[key];
  if (!value && required) {
    console.error(`环境变量 ${key} 未配置`);
  }
  return value || '';
};

/**
 * 处理私钥格式
 * 环境变量中的私钥可能有以下格式：
 * 1. 直接的PEM格式（带真实换行）
 * 2. 换行符用 \n 表示的字符串
 * 3. 换行符用 \\n 表示的字符串
 * 4. Base64编码的私钥（不带BEGIN/END标记）
 */
const formatPrivateKey = (rawKey) => {
  if (!rawKey) return '';
  
  let key = rawKey.trim();
  
  // 如果是字面的 \n（两个字符），替换为真实换行符
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  
  // 如果私钥不包含 BEGIN 标记，可能是纯 Base64，需要添加标记
  if (!key.includes('-----BEGIN')) {
    // 移除可能的空格和换行
    const base64Content = key.replace(/\s/g, '');
    
    // 每64个字符添加换行
    const formattedContent = base64Content.match(/.{1,64}/g)?.join('\n') || base64Content;
    
    key = `-----BEGIN PRIVATE KEY-----\n${formattedContent}\n-----END PRIVATE KEY-----`;
  }
  
  // 确保格式正确：BEGIN 和 END 标记后应该有换行
  key = key.replace(/-----BEGIN PRIVATE KEY-----(?!\n)/g, '-----BEGIN PRIVATE KEY-----\n');
  key = key.replace(/(?<!\n)-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----');
  
  // 移除多余的空行
  key = key.replace(/\n{3,}/g, '\n\n');
  
  return key;
};

// 微信支付V3配置
const config = {
  // 小程序 AppID
  appid: getEnvVar('WX_APPID'),
  
  // 商户号（直连商户）
  mchid: getEnvVar('WX_MCHID'),
  
  // 商户API证书序列号
  serialNo: getEnvVar('WX_SERIAL_NO'),
  
  // 商户API私钥（PEM格式）
  get privateKey() {
    const rawKey = getEnvVar('WX_PRIVATE_KEY');
    return formatPrivateKey(rawKey);
  },
  
  // APIv3密钥（32位字符串）
  apiV3Key: getEnvVar('WX_APIV3_KEY'),
  
  // 云开发环境ID
  envId: 'cloud1-5gb9c5u2c58ad6d7',
  
  // 支付回调云函数名称
  callbackFunctionName: 'wxpayOrderCallback',
  
  // 支付回调 URL（HTTP 触发器）
  // 格式：https://{envId}.service.tcloudbase.com/{path}
  callbackUrl: 'https://cloud1-5gb9c5u2c58ad6d7.service.tcloudbase.com/wxpay/callback',
  
  // 退款回调云函数名称
  refundCallbackFunctionName: 'wxpayRefundCallback',
  
  // 退款回调 URL（HTTP 触发器）
  refundCallbackUrl: 'https://cloud1-5gb9c5u2c58ad6d7.service.tcloudbase.com/wxpay/refund-callback'
};

/**
 * 验证配置是否完整
 * @returns {{ valid: boolean, missing: string[] }} 验证结果
 */
const validateConfig = () => {
  const requiredFields = ['appid', 'mchid', 'serialNo', 'privateKey', 'apiV3Key'];
  const missing = [];
  
  for (const field of requiredFields) {
    const value = field === 'privateKey' ? config.privateKey : config[field];
    if (!value) {
      missing.push(field);
    }
  }
  
  // 额外验证私钥格式
  if (config.privateKey && !config.privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error('私钥格式不正确，缺少 BEGIN PRIVATE KEY 标记');
    missing.push('privateKey (格式错误)');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
};

/**
 * 打印配置摘要（用于调试，隐藏敏感信息）
 */
const printConfigSummary = () => {
  console.log('=== 微信支付V3配置摘要 ===');
  console.log('AppID:', config.appid ? `${config.appid.substring(0, 6)}***` : '未配置');
  console.log('商户号:', config.mchid ? `${config.mchid.substring(0, 4)}***` : '未配置');
  console.log('证书序列号:', config.serialNo ? `${config.serialNo.substring(0, 8)}***` : '未配置');
  
  const pk = config.privateKey;
  if (pk) {
    const hasBegin = pk.includes('-----BEGIN PRIVATE KEY-----');
    const hasEnd = pk.includes('-----END PRIVATE KEY-----');
    console.log('私钥: 已配置');
    console.log('  - BEGIN标记:', hasBegin ? '✓' : '✗');
    console.log('  - END标记:', hasEnd ? '✓' : '✗');
    console.log('  - 长度:', pk.length, '字符');
    console.log('  - 前50字符:', pk.substring(0, 50));
  } else {
    console.log('私钥: 未配置');
  }
  
  console.log('APIv3密钥:', config.apiV3Key ? '已配置' : '未配置');
  console.log('========================');
};

module.exports = {
  config,
  validateConfig,
  printConfigSummary
};
