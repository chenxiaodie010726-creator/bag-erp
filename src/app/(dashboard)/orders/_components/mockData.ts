/* ============================================================
 * 客户订单模拟数据（测试用：仅 1 条）
 * 文件位置: src/app/(dashboard)/orders/_components/mockData.ts
 * ============================================================ */

export type OrderStatus = '已确认' | '待确认' | '部分发货' | '已发货' | '已取消';

export interface OrderItem {
  id: string;
  poNumber: string;
  amount: number;
  poQty: number;
  batches: number;
  status: OrderStatus;
  orderDate: string;   // YYYY-MM-DD
  customerName: string;
}

/* ============================================================
 * 测试订单：PO#TEST001
 * 包含 2 个 SKU 行：
 *   TEST-RALLY-GRN → 已在产品管理中注册（不会进入「未录入」）
 *   TEST-HILO-BLK  → 未注册（会进入「未录入」，可从那里录入到产品）
 * 金额 = 80×13 + 160×13 = $3,120
 * ============================================================ */
export const MOCK_ORDERS: OrderItem[] = [];
