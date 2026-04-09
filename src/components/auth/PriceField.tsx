'use client';

/* ============================================================
 * 价格显示组件
 * 说明: 包裹价格内容，无权限时不渲染任何东西
 *       用法: <PriceField>${price}</PriceField>
 * ============================================================ */

import { useAuth } from './AuthProvider';

interface PriceFieldProps {
  children: React.ReactNode;
  /** 如果需要，可以指定无权限时显示的替代内容，默认不显示 */
  fallback?: React.ReactNode;
}

export default function PriceField({ children, fallback = null }: PriceFieldProps) {
  const { showPrice } = useAuth();

  if (!showPrice) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
