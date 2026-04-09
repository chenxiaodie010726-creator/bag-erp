/* ============================================================
 * 根布局
 * 说明: 全局 HTML 结构，包裹 AuthProvider 提供认证上下文
 * ============================================================ */

import type { Metadata } from 'next';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: '晟砜皮具 ERP',
  description: '晟砜皮具企业资源管理系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
