/* ============================================================
 * 认证工具函数
 * 说明: 封装 Supabase Auth 相关操作
 * ============================================================ */

import { supabase } from './supabase';
import type { Role } from './permissions';

/**
 * 将 Supabase Auth 返回的英文错误转为可读中文（含速率限制提示）
 */
export function humanizeAuthError(raw: string | undefined | null): string {
  if (!raw) return '操作失败，请重试';
  const lower = raw.toLowerCase();

  const afterSec = raw.match(/after (\d+) seconds?/i);
  if (afterSec) {
    return `操作过于频繁，请等待约 ${afterSec[1]} 秒后再试（Supabase 安全限制，非密码错误）。`;
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('email rate limit')) {
    return '请求过于频繁，请等待 1 分钟后再试，或减少连续点击。';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) {
    return '邮箱或密码错误';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return '该邮箱已注册，请直接登录或换邮箱';
  }
  if (lower.includes('password') && lower.includes('least')) {
    return '密码长度不符合要求';
  }

  return raw;
}

/** ERP 用户信息 */
export interface ErpUser {
  id: string;
  authId: string;
  name: string;
  role: Role;
  department: string | null;
  isActive: boolean;
  email: string;
}

/**
 * 邮箱密码登录
 */
export async function signIn(email: string, password: string): Promise<{ user: ErpUser | null; error: string | null }> {
  // 1. Supabase Auth 登录
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { user: null, error: humanizeAuthError(authError?.message) };
  }

  // 2. 查询 erp_users 表获取角色信息
  const { data: erpUser, error: dbError } = await supabase
    .from('erp_users')
    .select('*')
    .eq('auth_id', authData.user.id)
    .single();

  if (dbError || !erpUser) {
    // auth 成功但 erp_users 里没有记录，说明账号未被管理员创建
    await supabase.auth.signOut();
    return { user: null, error: '账号未授权，请联系管理员' };
  }

  if (!erpUser.is_active) {
    await supabase.auth.signOut();
    return { user: null, error: '账号已停用，请联系管理员' };
  }

  return {
    user: {
      id: erpUser.id,
      authId: erpUser.auth_id,
      name: erpUser.name,
      role: erpUser.role as Role,
      department: erpUser.department,
      isActive: erpUser.is_active,
      email: authData.user.email ?? '',
    },
    error: null,
  };
}

/**
 * 退出登录
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * 获取当前登录的 ERP 用户信息
 */
export async function getCurrentUser(): Promise<ErpUser | null> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: erpUser } = await supabase
    .from('erp_users')
    .select('*')
    .eq('auth_id', authUser.id)
    .single();

  if (!erpUser || !erpUser.is_active) return null;

  return {
    id: erpUser.id,
    authId: erpUser.auth_id,
    name: erpUser.name,
    role: erpUser.role as Role,
    department: erpUser.department,
    isActive: erpUser.is_active,
    email: authUser.email ?? '',
  };
}

/**
 * 检查是否存在任何 ERP 用户（用于首次初始化判断）
 */
export async function hasAnyUser(): Promise<boolean> {
  const { count } = await supabase
    .from('erp_users')
    .select('*', { count: 'exact', head: true });
  return (count ?? 0) > 0;
}

/**
 * 首次初始化：创建超级管理员账号
 */
export async function initSuperAdmin(email: string, password: string, name: string): Promise<{ error: string | null }> {
  // 1. 注册 Auth 账号
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { error: humanizeAuthError(authError?.message) };
  }

  // 2. 在 erp_users 表中创建记录
  const { error: dbError } = await supabase.from('erp_users').insert({
    auth_id: authData.user.id,
    name,
    role: 'super_admin',
    department: '管理层',
    is_active: true,
  });

  if (dbError) {
    return { error: dbError.message };
  }

  return { error: null };
}
