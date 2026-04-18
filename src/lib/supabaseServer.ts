/* ============================================================
 * 服务端 Supabase 客户端
 * 说明: 仅在 API 路由（Route Handlers）中使用
 *       使用 service_role key，拥有完整数据库权限
 *       不暴露给前端（无 NEXT_PUBLIC_ 前缀）
 * ============================================================ */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseServiceKey) {
  console.warn(
    '[Supabase Server] 警告：SUPABASE_SERVICE_ROLE_KEY 未配置。' +
    '请在 .env.local 中添加该变量（从 Supabase 控制台 → Settings → API → service_role 获取）。'
  );
}

/** 创建服务端 Supabase 客户端实例（每次请求新建，避免跨请求状态污染） */
export function createServerSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}
