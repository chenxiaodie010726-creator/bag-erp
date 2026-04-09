'use client';

/* ============================================================
 * 账号管理页面
 * 说明: 仅超级管理员可见，用于创建/编辑/停用员工账号
 * 路由: /settings/accounts
 * ============================================================ */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import CreateAccountModal from './_components/CreateAccountModal';
import EditAccountModal from './_components/EditAccountModal';
import ResetPasswordModal from './_components/ResetPasswordModal';

/** 账号列表项 */
interface AccountItem {
  id: string;
  auth_id: string;
  name: string;
  role: Role;
  department: string | null;
  is_active: boolean;
  created_at: string;
  email?: string;
}

export default function AccountsPage() {
  const { user } = useAuth();

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* 弹窗状态 */
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountItem | null>(null);
  const [resetTarget, setResetTarget] = useState<AccountItem | null>(null);

  /* 加载账号列表 */
  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('erp_users')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('加载账号失败:', error);
        return;
      }

      // 获取 Auth 用户的邮箱信息
      // 注意：anon key 无法调用 admin API 列举用户，所以邮箱需要从其他途径获取
      // 这里我们在创建时把邮箱也存到 erp_users 表中（后续会加 email 字段）
      setAccounts((data as AccountItem[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  /* 切换账号启用/停用 */
  async function toggleActive(account: AccountItem) {
    const newStatus = !account.is_active;
    const { error } = await supabase
      .from('erp_users')
      .update({ is_active: newStatus })
      .eq('id', account.id);

    if (error) {
      alert('操作失败: ' + error.message);
      return;
    }
    loadAccounts();
  }

  /* 删除账号 */
  async function handleDelete(account: AccountItem) {
    if (account.role === 'super_admin') {
      alert('不能删除超级管理员账号');
      return;
    }
    if (!confirm(`确定要删除账号「${account.name}」吗？此操作不可恢复。`)) return;

    // 删除 erp_users 记录
    const { error } = await supabase
      .from('erp_users')
      .delete()
      .eq('id', account.id);

    if (error) {
      alert('删除失败: ' + error.message);
      return;
    }
    loadAccounts();
  }

  /* 权限检查 */
  if (user?.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <p>无权访问此页面</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ===== 标题栏 ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">账号管理</h1>
          <span className="text-sm text-gray-400">管理所有员工的登录账号和角色权限</span>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
        >
          + 创建账号
        </button>
      </div>

      {/* ===== 账号列表 ===== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">姓名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">邮箱</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">角色</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">部门</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">创建时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-48">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                  加载中...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                  暂无账号
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{acc.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{acc.email ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={[
                      'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                      acc.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                      acc.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600',
                    ].join(' ')}>
                      {ROLE_LABELS[acc.role] ?? acc.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{acc.department ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {acc.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        停用
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(acc.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditTarget(acc)}
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => setResetTarget(acc)}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        重置密码
                      </button>
                      <button
                        onClick={() => toggleActive(acc)}
                        className={[
                          'text-xs transition-colors',
                          acc.is_active
                            ? 'text-orange-500 hover:text-orange-700'
                            : 'text-green-500 hover:text-green-700',
                        ].join(' ')}
                      >
                        {acc.is_active ? '停用' : '启用'}
                      </button>
                      {acc.role !== 'super_admin' && (
                        <button
                          onClick={() => handleDelete(acc)}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ===== 弹窗 ===== */}
      {createOpen && (
        <CreateAccountModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { setCreateOpen(false); loadAccounts(); }}
        />
      )}
      {editTarget && (
        <EditAccountModal
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); loadAccounts(); }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          account={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
