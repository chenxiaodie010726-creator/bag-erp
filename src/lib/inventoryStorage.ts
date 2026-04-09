/* ============================================================
 * 库存 localStorage 读写 + 遗留演示数据清理
 * ============================================================ */

import type { PoGroupData } from '@/app/(dashboard)/inventory/_components/mockData';
import { STORAGE_KEYS } from '@/lib/storageKeys';

/** 旧版入库/库存页内置的演示 PO（已从代码移除），从用户浏览器中剔除 */
const LEGACY_DEMO_PO_NUMBERS = new Set(['PO#260501', 'PO#260502', 'PO#260503']);

export function stripLegacyDemoPoGroups(groups: PoGroupData[]): PoGroupData[] {
  return groups.filter((g) => !LEGACY_DEMO_PO_NUMBERS.has(g.poNumber.trim().toUpperCase()));
}

/**
 * 读取 cf_erp_inventory；若仍含遗留演示 PO，写回已清理的数据。
 */
export function loadInventoryFromStorage(): PoGroupData[] {
  let groups: PoGroupData[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) groups = parsed as PoGroupData[];
    }
  } catch {
    return [];
  }
  const cleaned = stripLegacyDemoPoGroups(groups);
  if (cleaned.length !== groups.length) {
    try {
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(cleaned));
    } catch {
      /* quota */
    }
  }
  return cleaned;
}
