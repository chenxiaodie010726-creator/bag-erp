/* ============================================================
 * 仪表盘布局 (Dashboard Layout)
 * 说明: 所有业务页面共享此布局，左侧是侧边栏，右侧是页面内容
 *       使用 Next.js 路由组 (dashboard) 来组织，不影响 URL
 * 文件位置: src/app/(dashboard)/layout.tsx
 * ============================================================ */

import Sidebar from '@/components/layout/Sidebar';

/**
 * 仪表盘布局组件
 * 结构: [ 侧边栏 | 主内容区 ]
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-full">
      {/* 左侧：固定侧边栏 */}
      <Sidebar />

      {/* 右侧：主内容区域 */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
