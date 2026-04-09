'use client';

/* ============================================================
 * 仪表盘布局 (Dashboard Layout)
 * 说明: 所有业务页面共享此布局。
 *       加入登录检查：未登录跳转到 /login
 *       加入权限检查：无权限跳转到首个有权限的页面
 * ============================================================ */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/components/auth/AuthProvider';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading, canAccessPage } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // 未登录 → 跳转登录页
    if (!user) {
      router.replace('/login');
      return;
    }

    // 已登录但无权访问当前页面 → 跳转到订单页
    if (!canAccessPage(pathname)) {
      router.replace('/orders');
    }
  }, [user, loading, pathname, canAccessPage, router]);

  // 加载中显示空白
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  // 未登录时不渲染内容（等待跳转）
  if (!user) {
    return null;
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
