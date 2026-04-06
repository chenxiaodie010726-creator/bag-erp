/* ============================================================
 * 订单总览页面
 * 说明: 首发核心模块之一，展示所有订单列表
 *       后续将根据设计稿完善布局和交互
 * 文件位置: src/app/(dashboard)/orders/page.tsx
 * URL: /orders
 * ============================================================ */

export default function OrdersPage() {
  return (
    <div>
      {/* 页面标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">订单总览</h1>
      </div>

      {/* 订单内容区域（等待后续开发） */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-gray-500 text-sm">订单总览模块 — 等待设计稿后深度开发</p>
      </div>
    </div>
  );
}
