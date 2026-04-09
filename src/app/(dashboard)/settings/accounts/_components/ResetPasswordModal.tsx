'use client';

/* ============================================================
 * 重置密码弹窗
 * 说明: 由于 Supabase anon key 无法调用 admin API 修改密码，
 *       这里提供两种方式：
 *       1. 发送重置密码邮件（需要员工邮箱能收到邮件）
 *       2. 显示提示，让管理员去 Supabase 后台手动重置
 * ============================================================ */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AccountItem {
  id: string;
  name: string;
  email?: string;
}

interface Props {
  account: AccountItem;
  onClose: () => void;
}

export default function ResetPasswordModal({ account, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSendReset() {
    if (!account.email) {
      setError('该账号没有邮箱信息');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        account.email,
        { redirectTo: window.location.origin + '/login' }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
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
          <h2 className="text-lg font-bold text-gray-800">重置密码</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            为账号「<b>{account.name}</b>」重置密码
            {account.email && <span className="text-gray-400">（{account.email}）</span>}
          </p>

          {sent ? (
            <div className="text-sm text-green-600 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              重置密码邮件已发送，请通知员工查收邮箱。
            </div>
          ) : (
            <>
              {account.email ? (
                <button
                  onClick={handleSendReset}
                  disabled={loading}
                  className={[
                    'w-full py-2 text-sm font-medium rounded-md transition-colors',
                    loading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-700',
                  ].join(' ')}
                >
                  {loading ? '发送中...' : '发送重置密码邮件'}
                </button>
              ) : (
                <div className="text-sm text-orange-600 bg-orange-50 border border-orange-100 rounded-md px-3 py-2">
                  该账号没有邮箱信息，请前往 Supabase 后台手动重置密码。
                </div>
              )}

              <div className="text-xs text-gray-400 bg-gray-50 rounded-md px-3 py-2">
                <p className="font-medium text-gray-500 mb-1">备选方案：</p>
                <p>如果员工无法收到邮件，你可以去 Supabase 后台 → Authentication → Users → 找到该用户 → 手动修改密码。</p>
              </div>
            </>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
