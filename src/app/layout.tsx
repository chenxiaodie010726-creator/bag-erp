/* ============================================================
 * 根布局 (Root Layout)
 * 说明: 这是整个应用最外层的布局，设置语言为中文、引入全局样式
 *       所有页面都会被包裹在这个布局里
 * 文件位置: src/app/layout.tsx
 * ============================================================ */

import type { Metadata } from 'next';
import './globals.css';

/** 网页标题和描述（显示在浏览器标签页上） */
export const metadata: Metadata = {
  title: '晟砜皮具 ERP',
  description: 'CF Leather ERP — 皮具企业资源管理系统',
};

/**
 * 根布局组件
 * @param children - 子页面内容，由 Next.js 自动注入
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="zh-CN" 表示页面语言为简体中文
    <html lang="zh-CN" className="h-full">
      <body className="h-full bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
