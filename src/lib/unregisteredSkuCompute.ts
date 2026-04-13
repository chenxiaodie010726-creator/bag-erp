/* ============================================================
 * 未录入 SKU：由「客户订单明细」与「产品/套装 SKU 库」动态比对
 * 不依赖仅导入时写入的静态列表，保证与订单总览、产品列表数据一致
 * ============================================================ */

import type { OrderDetailData } from '@/app/(dashboard)/orders/[id]/_components/mockData';
import { getOrderDetail } from '@/app/(dashboard)/orders/[id]/_components/mockData';
import type { OrderItem } from '@/app/(dashboard)/orders/_components/mockData';
import type { UnregisteredSkuEntry } from '@/lib/orderInventorySync';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { getAllKnownSkus } from '@/lib/skuLookup';

function loadOrdersList(): OrderItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as OrderItem[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** 与订单详情页一致：优先用已保存的明细，否则用 getOrderDetail 生成/硬编码 */
export function resolveOrderDetailForOrder(order: OrderItem): OrderDetailData {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ORDER_DETAIL_PREFIX + order.id);
      if (stored) return JSON.parse(stored) as OrderDetailData;
    } catch {
      /* ignore */
    }
  }
  return getOrderDetail(order.id, order.batches, order.amount, order.poQty);
}

/**
 * 扫描全部订单明细，找出不在产品列表、套装列表中的 SKU。
 * 同一订单同一明细行固定 id：`unreg_${orderId}_${lineId}`
 */
export function computeUnregisteredSkuEntriesFromOrders(): UnregisteredSkuEntry[] {
  const known = getAllKnownSkus();
  const orders = loadOrdersList();
  const out: UnregisteredSkuEntry[] = [];
  const now = new Date().toISOString();

  for (const order of orders) {
    const detail = resolveOrderDetailForOrder(order);
    if (!detail?.items?.length) continue;

    for (const line of detail.items) {
      const sku = line.sku?.trim();
      if (!sku) continue;
      if (known.has(sku.toUpperCase())) continue;

      out.push({
        id: `unreg_${order.id}_${line.id}`,
        sku: line.sku,
        colorName: line.colorName ?? '',
        styleName: line.styleName ?? '',
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        poNumber: order.poNumber,
        orderId: order.id,
        orderDate: order.orderDate,
        discoveredAt: now,
      });
    }
  }

  return out;
}

// ---------- 用户在本页「删除」= 暂时忽略该条，仍可从「清除忽略」恢复 ----------

export function loadDismissedUnregisteredIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.UNREGISTERED_DISMISSED_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function saveDismissedUnregisteredIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEYS.UNREGISTERED_DISMISSED_IDS, JSON.stringify([...ids]));
  } catch {
    /* quota */
  }
}

export function dismissUnregisteredEntry(id: string) {
  const s = loadDismissedUnregisteredIds();
  s.add(id);
  saveDismissedUnregisteredIds(s);
}

export function clearDismissedUnregisteredEntries() {
  try {
    localStorage.removeItem(STORAGE_KEYS.UNREGISTERED_DISMISSED_IDS);
  } catch {
    /* ignore */
  }
}
