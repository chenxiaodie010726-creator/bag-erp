'use client';

/* ============================================================
 * 创建账号弹窗
 * ============================================================ */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

const CREATABLE_ROLES: Role[] = ['admin', 'clerk', 'production', 'packaging'];
const DEPARTMENTS = ['管理层', '文员部', '生产部', '包装部', '其他'];

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateAccountModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('clerk');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('请填写所有必填项');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      // 1. 通过 Supabase Auth 注册账号
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        setError(authError?.message ?? '创建失败');
        return;
      }

      // 2. 在 erp_users 表中插入记录
      const { error: dbError } = await supabase.from('erp_users').insert({
        auth_id: authData.user.id,
        name: name.trim(),
        email: email.trim(),
        role,
        department: department || null,
        is_active: true,
      });

      if (dbError) {
        setError(dbError.message);
        return;
      }

      onSuccess();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">创建新账号</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="员工姓名"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱 *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="用于登录的邮箱地址"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码 *</label>
            <input
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位（创建后告知员工）"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">密码明文显示，方便你记录后告知员工</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色 *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              {CREATABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">部门</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">选择部门</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className={[
                'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
                loading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-700',
              ].join(' ')}
            >
              {loading ? '创建中...' : '创建账号'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
