'use client';

/* ============================================================
 * 登录页面
 * 说明: 邮箱 + 密码登录，无注册入口
 *       首次使用时显示初始化引导（创建超级管理员）
 * ============================================================ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, hasAnyUser, initSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /* 是否处于首次初始化模式 */
  const [isInit, setIsInit] = useState(false);
  const [checking, setChecking] = useState(true);

  /* 检查是否需要初始化 */
  useEffect(() => {
    async function check() {
      try {
        const exists = await hasAnyUser();
        setIsInit(!exists);
      } catch {
        setIsInit(false);
      } finally {
        setChecking(false);
      }
    }
    check();
  }, []);

  /* 登录 */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user, error: loginError } = await signIn(email, password);
      if (loginError || !user) {
        setError(loginError ?? '登录失败');
        return;
      }
      setUser(user);
      router.push('/orders');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  /* 初始化超级管理员 */
  async function handleInit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('密码至少 6 位');
      setLoading(false);
      return;
    }

    try {
      const { error: initError } = await initSuperAdmin(email, password, name);
      if (initError) {
        setError(initError);
        return;
      }
      // 初始化成功，自动登录
      const { user, error: loginError } = await signIn(email, password);
      if (loginError || !user) {
        setError('账号创建成功，请手动登录');
        setIsInit(false);
        return;
      }
      setUser(user);
      router.push('/orders');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">晟砜皮具 ERP</h1>
          <p className="text-sm text-gray-400 mt-1">
            {isInit ? '首次使用 — 创建超级管理员账号' : '请登录您的账号'}
          </p>
        </div>

        {/* 表单 */}
        <form
          onSubmit={isInit ? handleInit : handleLogin}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
        >
          {/* 初始化模式：额外显示姓名输入 */}
          {isInit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入您的姓名"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入邮箱地址"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isInit ? '设置密码（至少6位）' : '输入密码'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={[
              'w-full py-2.5 text-sm font-medium rounded-md transition-colors',
              loading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-700',
            ].join(' ')}
          >
            {loading ? '处理中...' : isInit ? '创建账号并登录' : '登录'}
          </button>
        </form>

        {/* 底部 */}
        <div className="text-center mt-6 text-xs text-gray-400">
          CF Leather ERP v0.1
        </div>
      </div>
    </div>
  );
}
