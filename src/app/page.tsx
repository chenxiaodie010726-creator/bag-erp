/* ============================================================
 * 首页 — 自动跳转到订单总览
 * 说明: 用户访问根路径 "/" 时，自动重定向到 "/orders"
 * 文件位置: src/app/page.tsx
 * ============================================================ */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/orders');
}
