/* ============================================================
 * 权限配置中心
 * 说明: 集中管理所有页面的角色权限
 *       新增页面时只需在 PAGE_PERMISSIONS 中添加一行即可
 * ============================================================ */

/** 角色类型 */
export type Role = 'super_admin' | 'admin' | 'clerk' | 'production' | 'packaging';

/** 权限级别 */
export type PermissionLevel = 'full' | 'read' | 'none';

/** 角色中文名称映射 */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  clerk: '文员',
  production: '生产',
  packaging: '包装',
};

/** 角色是否可以查看价格 */
export function canViewPrice(role: Role): boolean {
  return role === 'super_admin' || role === 'admin';
}

/**
 * 页面权限配置
 *
 * 新增页面时只需在这里添加一行，侧边栏和路由保护会自动生效。
 * 如果某个路由未配置，默认规则：super_admin 和 admin 可见，其他角色不可见。
 */
export const PAGE_PERMISSIONS: Record<string, Record<Role, PermissionLevel>> = {
  // ===== 客户订单 =====
  '/orders':                          { super_admin: 'full', admin: 'full', clerk: 'full', production: 'read', packaging: 'none' },
  '/unregistered':                    { super_admin: 'full', admin: 'full', clerk: 'full', production: 'none', packaging: 'none' },

  // ===== 产品管理 =====
  '/products':                        { super_admin: 'full', admin: 'full', clerk: 'full', production: 'read', packaging: 'none' },
  '/colors':                          { super_admin: 'full', admin: 'full', clerk: 'full', production: 'read', packaging: 'none' },
  '/cost-sheet':                      { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },
  '/cost-sheets':                     { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },
  '/sets':                            { super_admin: 'full', admin: 'full', clerk: 'full', production: 'read', packaging: 'none' },

  // ===== 出入库管理 =====
  '/inbound':                         { super_admin: 'full', admin: 'full', clerk: 'full', production: 'none', packaging: 'full' },
  '/inventory':                       { super_admin: 'full', admin: 'full', clerk: 'full', production: 'read', packaging: 'full' },
  '/packing-list':                    { super_admin: 'full', admin: 'full', clerk: 'full', production: 'none', packaging: 'full' },

  // ===== 生产管理 =====
  '/production':                      { super_admin: 'full', admin: 'full', clerk: 'full', production: 'full', packaging: 'none' },
  '/production-progress':             { super_admin: 'full', admin: 'full', clerk: 'read', production: 'full', packaging: 'none' },

  // ===== 供应商管理 =====
  '/suppliers':                       { super_admin: 'full', admin: 'full', clerk: 'full', production: 'none', packaging: 'none' },
  '/prices':                          { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },

  // ===== 财务管理 =====
  '/finance/reimbursement':           { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },
  '/finance/material-supplier-bills': { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },
  '/finance/processing-plant-bills':  { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },
  '/finance/daily-purchase':          { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },

  // ===== 报表分析 =====
  '/reports':                         { super_admin: 'full', admin: 'full', clerk: 'read', production: 'none', packaging: 'none' },

  // ===== 回收站 =====
  '/recycle-bin':                       { super_admin: 'full', admin: 'full', clerk: 'none', production: 'none', packaging: 'none' },

  // ===== 系统设置 =====
  '/settings':                        { super_admin: 'full', admin: 'none', clerk: 'none', production: 'none', packaging: 'none' },
  '/settings/accounts':               { super_admin: 'full', admin: 'none', clerk: 'none', production: 'none', packaging: 'none' },
};

/**
 * 获取某个角色对某个页面的权限级别
 * 支持动态路由匹配：/orders/[id] 会匹配 /orders 的权限
 */
export function getPermission(role: Role, pathname: string): PermissionLevel {
  // 精确匹配
  if (PAGE_PERMISSIONS[pathname]) {
    return PAGE_PERMISSIONS[pathname][role];
  }

  // 动态路由匹配：去掉最后一段路径再试（如 /orders/abc → /orders）
  const parentPath = pathname.replace(/\/[^/]+$/, '');
  if (parentPath && PAGE_PERMISSIONS[parentPath]) {
    return PAGE_PERMISSIONS[parentPath][role];
  }

  // 再试上一级（如 /finance/daily-purchase/abc → /finance/daily-purchase）
  // 已经在上面处理了

  // 默认：super_admin 和 admin 可见，其他不可见
  if (role === 'super_admin' || role === 'admin') return 'full';
  return 'none';
}

/**
 * 判断角色是否可以访问某个页面
 */
export function canAccess(role: Role, pathname: string): boolean {
  return getPermission(role, pathname) !== 'none';
}

/**
 * 判断角色对某个页面是否只读
 */
export function isReadOnly(role: Role, pathname: string): boolean {
  return getPermission(role, pathname) === 'read';
}
