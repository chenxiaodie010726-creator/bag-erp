/* ============================================================
 * 根据客户 PO 号，从订单明细（localStorage）解析 SKU → EXW 单价
 * 用于装箱单从 PO 导入时带出单价
 * ============================================================ */

import type { OrderItem } from '@/app/(dashboard)/orders/_components/mockData';
import type { OrderDetailData } from '@/app/(dashboard)/orders/[id]/_components/mockData';
import { STORAGE_KEYS } from '@/lib/storageKeys';

function normPo(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * 返回该 PO 下各 SKU 的订单单价（无订单明细时为空对象）
 */
export function buildSkuUnitPriceMapForPo(poNumber: string): Record<string, number> {
  const map: Record<string, number> = {};
  let orders: OrderItem[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) orders = parsed as OrderItem[];
    }
  } catch {
    /* ignore */
  }

  const order = orders.find((o) => normPo(o.poNumber) === normPo(poNumber));
  if (!order) return map;

  try {
    const detailRaw = localStorage.getItem(`${STORAGE_KEYS.ORDER_DETAIL_PREFIX}${order.id}`);
    if (!detailRaw) return map;
    const detail = JSON.parse(detailRaw) as OrderDetailData;
    if (!detail?.items) return map;
    for (const it of detail.items) {
      map[it.sku] = it.unitPrice;
    }
  } catch {
    /* ignore */
  }
  return map;
}
