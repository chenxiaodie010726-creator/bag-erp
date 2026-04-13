/* ============================================================
 * 物料单位：与「价格管理」物料库编号/名称匹配
 * ============================================================ */

import type { PriceItem } from '@/app/(dashboard)/prices/_components/mockData';
import { MOCK_MATERIAL_PRICES } from '@/app/(dashboard)/prices/_components/mockData';
import type { CostSheetMaterialItem } from '@/types';

const catalogList: PriceItem[] = MOCK_MATERIAL_PRICES.filter((p) => p.tab === '物料' && p.status === '有效');

/** 按编号或名称在价格表中查找单位 */
export function lookupMaterialUnitFromCatalog(
  partName: string,
  materialCode: string | null | undefined,
): string {
  const code = materialCode?.trim();
  if (code) {
    const byCode = catalogList.find((p) => p.code === code);
    if (byCode?.unit) return byCode.unit;
  }
  const name = partName.trim();
  if (!name) return '—';
  const exact = catalogList.find((p) => p.name === name);
  if (exact?.unit) return exact.unit;
  const candidates = catalogList.filter((p) => p.name.includes(name) || name.includes(p.name));
  if (candidates.length === 0) return '—';
  candidates.sort((a, b) => b.name.length - a.name.length);
  return candidates[0]?.unit ?? '—';
}

/** 同一类别下各物料单位去重后展示（多种则用「/」连接） */
export function getCategoryUnitsDisplay(items: CostSheetMaterialItem[]): string {
  const set = new Set<string>();
  for (const it of items) {
    const u = lookupMaterialUnitFromCatalog(it.part_name, it.material_code);
    if (u && u !== '—') set.add(u);
  }
  if (set.size === 0) return '—';
  return Array.from(set).join('/');
}
