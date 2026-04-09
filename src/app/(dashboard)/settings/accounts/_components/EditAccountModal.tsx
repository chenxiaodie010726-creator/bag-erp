'use client';

/* ============================================================
 * 编辑账号弹窗
 * ============================================================ */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

const EDITABLE_ROLES: Role[] = ['admin', 'clerk', 'production', 'packaging'];
const DEPARTMENTS = ['管理层', '文员部', '生产部', '包装部', '其他'];

interface AccountItem {
  id: string;
  name: string;
  role: Role;
  department: string | null;
}

interface Props {
  account: AccountItem;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditAccountModal({ account, onClose, onSuccess }: Props) {
  const [name, setName] = useState(account.name);
  const [role, setRole] = useState<Role>(account.role);
  const [department, setDepartment] = useState(account.department ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = account.role === 'super_admin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('姓名不能为空');
      return;
    }

    setLoading(true);
    try {
      const updateData: Record<string, string | null> = {
        name: name.trim(),
        department: department || null,
      };

      // 超级管理员的角色不可修改
      if (!isSuperAdmin) {
        updateData.role = role;
      }

      const { error: dbError } = await supabase
        .from('erp_users')
        .update(updateData)
        .eq('id', account.id);

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
          <h2 className="text-lg font-bold text-gray-800">编辑账号</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
            {isSuperAdmin ? (
              <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-500">
                超级管理员（不可修改）
              </div>
            ) : (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                {EDITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            )}
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
              {loading ? '保存中...' : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
