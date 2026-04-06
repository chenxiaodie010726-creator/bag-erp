/* ============================================================
 * 产品列表页面
 * 说明: 首发核心模块之一，展示所有产品资料卡
 *       包含产品编号、名称、分类、图片、BOM用料等
 * 文件位置: src/app/(dashboard)/products/page.tsx
 * URL: /products
 * ============================================================ */

export default function ProductsPage() {
  return (
    <div>
      {/* 页面标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">产品列表</h1>
      </div>

      {/* 产品内容区域（等待后续开发） */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-gray-500 text-sm">产品列表模块 — 等待设计稿后深度开发</p>
      </div>
    </div>
  );
}
