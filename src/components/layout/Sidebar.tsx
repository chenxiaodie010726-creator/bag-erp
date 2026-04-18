'use client';

/* ============================================================
 * 侧边栏导航组件（带权限过滤 + 退出登录）
 * ============================================================ */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

interface ChildNavItem {
  label: string;
  href: string;
}

interface ParentNavGroup {
  label: string;
  icon: string;
  children: ChildNavItem[];
}

const NAV_GROUPS: ParentNavGroup[] = [
  {
    label: '客户订单',
    icon: '📋',
    children: [
      { label: '订单总览', href: '/orders' },
      { label: '未录入', href: '/unregistered' },
    ],
  },
  {
    label: '产品管理',
    icon: '👜️',
    children: [
      { label: '产品列表', href: '/products' },
      { label: '颜色管理', href: '/colors' },
      { label: '成本核算表', href: '/cost-sheet' },
    ],
  },
  {
    label: '出入库管理',
    icon: '📦',
    children: [
      { label: '入库管理', href: '/inbound' },
      { label: '订单库存', href: '/inventory' },
      { label: '装箱单管理', href: '/packing-list' },
    ],
  },
  {
    label: '生产管理',
    icon: '🔧',
    children: [
      { label: '生产单管理', href: '/production' },
      { label: '生产进度', href: '/production-progress' },
    ],
  },
  {
    label: '供应商管理',
    icon: '🏭',
    children: [
      { label: '供应商列表', href: '/suppliers' },
      { label: '价格管理', href: '/prices' },
    ],
  },
  {
    label: '财务管理',
    icon: '💰',
    children: [
      { label: '报销单', href: '/finance/reimbursement' },
      { label: '物料/工艺账单', href: '/finance/material-supplier-bills' },
      { label: '加工厂账单', href: '/finance/processing-plant-bills' },
      { label: '日采购单', href: '/finance/daily-purchase' },
    ],
  },
  {
    label: '报表分析',
    icon: '📊',
    children: [
      { label: '数据报表', href: '/reports' },
    ],
  },
  {
    label: '回收站',
    icon: '🗑️',
    children: [
      { label: '回收站', href: '/recycle-bin' },
    ],
  },
  {
    label: '系统设置',
    icon: '⚙️',
    children: [
      { label: '基础设置', href: '/settings' },
      { label: '账号管理', href: '/settings/accounts' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser } = useAuth();

  const role = user?.role ?? 'clerk';

  /* 根据角色过滤导航：只显示有权限的菜单项 */
  const filteredGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      children: group.children.filter((child) => canAccess(role, child.href)),
    }))
    .filter((group) => group.children.length > 0);

  /* 记录每个父级是否展开 */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    filteredGroups.forEach((group) => {
      const hasActiveChild = group.children.some((c) => pathname.startsWith(c.href));
      initial[group.label] = hasActiveChild;
    });
    return initial;
  });

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  /* 退出登录 */
  async function handleSignOut() {
    await signOut();
    setUser(null);
    router.push('/login');
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-gray-900 text-gray-100">

      {/* ===== 顶部 Logo（点击刷新当前页） ===== */}
      <div className="px-5 py-5 border-b border-gray-700">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full text-left rounded-md -mx-1 px-1 py-0.5 text-lg font-bold tracking-wide text-gray-100 hover:bg-gray-800/80 hover:text-white transition-colors cursor-pointer"
          title="点击刷新页面"
        >
          晟砜皮具 ERP
        </button>
      </div>

      {/* ===== 导航菜单 ===== */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredGroups.map((group) => {
          const isOpen = !!openGroups[group.label];
          const isGroupActive = group.children.some((c) => pathname.startsWith(c.href));

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className={[
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors',
                  isGroupActive
                    ? 'text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                ].join(' ')}
              >
                <span className="flex items-center gap-2.5">
                  <span>{group.icon}</span>
                  <span className="font-medium">{group.label}</span>
                </span>
                <span className={[
                  'text-xs text-gray-500 transition-transform duration-200',
                  isOpen ? 'rotate-90' : '',
                ].join(' ')}>
                  ▶
                </span>
              </button>

              {isOpen && (
                <div className="ml-3 mt-0.5 mb-1 border-l border-gray-700 pl-3 space-y-0.5">
                  {group.children.map((child) => {
                    const isActive = pathname.startsWith(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={[
                          'block px-3 py-2 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-gray-700 text-white font-medium'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                        ].join(' ')}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ===== 底部用户信息 + 退出 ===== */}
      <div className="px-4 py-4 border-t border-gray-700">
        {user && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <span className="text-sm text-gray-200 font-medium">{user.name}</span>
              <span className="text-xs text-gray-500">{user.department ?? user.role}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="退出登录"
            >
              退出
            </button>
          </div>
        )}
        <div className="text-xs text-gray-600">
          晟砜皮具 ERP v0.1
        </div>
      </div>
    </aside>
  );
}
