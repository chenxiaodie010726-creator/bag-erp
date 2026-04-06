/* ============================================================
 * Supabase 客户端初始化
 * 说明: 项目通过此文件与 Supabase 数据库通信
 * 使用: 在任何需要读写数据库的地方 import { supabase } from '@/lib/supabase'
 * ============================================================ */

import { createClient } from '@supabase/supabase-js';

/* 从环境变量读取 Supabase 连接信息（在 .env.local 中配置） */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/* 校验：如果环境变量缺失，在控制台输出警告（不会导致崩溃） */
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] 警告：NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 未配置。' +
    '请在项目根目录 .env.local 文件中添加这两个变量。'
  );
}

/** Supabase 客户端实例（全局单例） */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
