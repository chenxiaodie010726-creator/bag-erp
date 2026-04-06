/* ============================================================
 * 企业微信服务 — 预留接口
 * 说明: 此文件预留了企业微信的消息推送和文件上传接口
 *       目前为空实现（占位），后续对接企业微信 API 时在此填充
 * ============================================================ */

/** 企业微信配置（后续从环境变量读取） */
interface WechatConfig {
  corpId: string;       // 企业ID
  agentId: string;      // 应用ID
  secret: string;       // 应用密钥
}

/** 消息推送参数 */
interface SendMessageParams {
  toUser: string;       // 接收人的企业微信ID
  content: string;      // 消息内容
  msgType?: 'text' | 'markdown';  // 消息类型
}

/** 文件上传参数 */
interface UploadFileParams {
  toUser: string;       // 接收人
  filePath: string;     // 文件路径
  fileName: string;     // 文件名
}

/**
 * 发送企业微信消息（预留）
 * TODO: 对接企业微信 API 后实现
 */
export async function sendWechatMessage(_params: SendMessageParams): Promise<{ success: boolean; message: string }> {
  console.log('[企业微信] 消息推送接口尚未对接，参数:', _params);
  return { success: false, message: '企业微信接口尚未配置' };
}

/**
 * 上传文件到企业微信（预留）
 * TODO: 对接企业微信 API 后实现
 */
export async function uploadWechatFile(_params: UploadFileParams): Promise<{ success: boolean; message: string }> {
  console.log('[企业微信] 文件上传接口尚未对接，参数:', _params);
  return { success: false, message: '企业微信接口尚未配置' };
}

/** 导出类型供外部使用 */
export type { WechatConfig, SendMessageParams, UploadFileParams };
