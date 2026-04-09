'use client';

/* ============================================================
 * 全局认证上下文
 * 说明: 提供当前用户信息和登录状态给整个应用
 * ============================================================ */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ErpUser } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth';
import type { Role } from '@/lib/permissions';
import { canViewPrice, canAccess, isReadOnly } from '@/lib/permissions';

interface AuthContextType {
  user: ErpUser | null;
  loading: boolean;
  /** 当前用户能否查看价格 */
  showPrice: boolean;
  /** 判断当前用户能否访问某个页面 */
  canAccessPage: (pathname: string) => boolean;
  /** 判断当前用户对某页面是否只读 */
  isPageReadOnly: (pathname: string) => boolean;
  /** 刷新用户信息 */
  refreshUser: () => Promise<void>;
  /** 设置用户（登录后调用） */
  setUser: (user: ErpUser | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  showPrice: false,
  canAccessPage: () => false,
  isPageReadOnly: () => true,
  refreshUser: async () => {},
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ErpUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  const role: Role | null = user?.role ?? null;

  const value: AuthContextType = {
    user,
    loading,
    showPrice: role ? canViewPrice(role) : false,
    canAccessPage: (pathname: string) => role ? canAccess(role, pathname) : false,
    isPageReadOnly: (pathname: string) => role ? isReadOnly(role, pathname) : true,
    refreshUser,
    setUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
