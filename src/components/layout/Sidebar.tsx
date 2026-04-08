'use client';

/* ============================================================
 * 侧边栏导航组件（可折叠二级菜单）
 * ============================================================ */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

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
    icon: '🛍️',
    children: [
      { label: '产品列表', href: '/products' },
      { label: '套装列表', href: '/sets' },
    ],
  },
  {
    label: '出入库管理',
    icon: '📦',
    children: [
      { label: '入库管理', href: '/inbound' },
      { label: '订单库存', href: '/inventory' },
    ],
  },
  {
    label: '供应商管理',
    icon: '🏭',
    children: [
      { label: '供应商列表', href: '/suppliers' },
    ],
  },
  {
    label: '财务管理',
    icon: '💰',
    children: [
      { label: '财务总览', href: '/finance' },
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
    label: '系统设置',
    icon: '⚙️',
    children: [
      { label: '基础设置', href: '/settings' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  /* 记录每个父级是否展开，默认将含有当前激活子项的父级展开 */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((group) => {
      /* 如果当前路径属于该分组，则默认展开 */
      const hasActiveChild = group.children.some((c) => pathname.startsWith(c.href));
      initial[group.label] = hasActiveChild;
    });
    return initial;
  });

  /* 切换某个父级的展开/折叠状态 */
  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-gray-900 text-gray-100">

      {/* ===== 顶部 Logo ===== */}
      <div className="px-5 py-5 border-b border-gray-700">
        <span className="text-lg font-bold tracking-wide">晟砜皮具 ERP</span>
      </div>

      {/* ===== 导航菜单 ===== */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const isOpen = !!openGroups[group.label];
          const isGroupActive = group.children.some((c) => pathname.startsWith(c.href));

          return (
            <div key={group.label}>

              {/* ---- 父级按钮（点击折叠/展开） ---- */}
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
                {/* 折叠箭头：展开时朝下，折叠时朝右 */}
                <span className={[
                  'text-xs text-gray-500 transition-transform duration-200',
                  isOpen ? 'rotate-90' : '',
                ].join(' ')}>
                  ▶
                </span>
              </button>

              {/* ---- 子级列表（展开时显示） ---- */}
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

      {/* ===== 底部版本信息 ===== */}
      <div className="px-5 py-4 border-t border-gray-700 text-xs text-gray-500">
        CF Leather ERP v0.1
      </div>
    </aside>
  );
}
