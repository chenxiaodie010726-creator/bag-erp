/* ============================================================
 * 五金单价：从价格管理物料库匹配，档位由颜色物料对照表首行「五金」列决定
 * ============================================================ */

import type { ColorMaterialMapEntry, CostSheetHardwareItem } from '@/types';
import type { PriceItem } from '@/app/(dashboard)/prices/_components/mockData';
import { MOCK_MATERIAL_PRICES, MATERIAL_PRICE_COLUMNS } from '@/app/(dashboard)/prices/_components/mockData';

export type HardwarePriceTier = 1 | 2 | 3;

/** 对照表首行中，列名包含「五金」的格子（如「五金颜色」） */
export function getHardwareFinishFromFirstColorRow(
  entries: ColorMaterialMapEntry[] | undefined | null,
): string | null {
  const first = entries?.[0];
  if (!first?.mappings) return null;
  const key = Object.keys(first.mappings).find((k) => k.includes('五金'));
  if (!key) return null;
  const v = first.mappings[key]?.trim();
  return v || null;
}

/**
 * 将对照表中的五金颜色描述映射到价格管理的三档价（浅金/白呖、鎏金、其他）
 */
export function resolveHardwarePriceTier(finishText: string | null | undefined): {
  tier: HardwarePriceTier;
  /** 与 MATERIAL_PRICE_COLUMNS 对应，用于展示 */
  columnLabel: string;
} {
  const t = (finishText ?? '').replace(/\s/g, '');
  if (!t) {
    return { tier: 1, columnLabel: MATERIAL_PRICE_COLUMNS[0] };
  }
  // 浅金、白呖、白啤(别字)、镍色等 → 一档（与价格表「浅金/白呖」同列）
  if (/浅金|白呖|白啤|白镍|镍呖/.test(t) && !/鎏金|镀金/.test(t)) {
    return { tier: 1, columnLabel: MATERIAL_PRICE_COLUMNS[0] };
  }
  if (/鎏金|镀金/.test(t)) {
    return { tier: 2, columnLabel: MATERIAL_PRICE_COLUMNS[1] };
  }
  return { tier: 3, columnLabel: MATERIAL_PRICE_COLUMNS[2] };
}

export function resolveHardwareTierFromColorMap(
  colorMap: ColorMaterialMapEntry[] | undefined | null,
): { tier: HardwarePriceTier; columnLabel: string; finishRaw: string | null } {
  const finishRaw = getHardwareFinishFromFirstColorRow(colorMap);
  const { tier, columnLabel } = resolveHardwarePriceTier(finishRaw);
  return { tier, columnLabel, finishRaw };
}

function pickTierPrice(item: PriceItem, tier: HardwarePriceTier): number | null {
  const primary = tier === 1 ? item.price1 : tier === 2 ? item.price2 : item.price3;
  if (primary != null && Number.isFinite(primary)) return primary;
  if (item.price3 != null && Number.isFinite(item.price3)) return item.price3;
  if (item.price1 != null && Number.isFinite(item.price1)) return item.price1;
  if (item.price2 != null && Number.isFinite(item.price2)) return item.price2;
  return null;
}

const hardwareCatalogList: PriceItem[] = MOCK_MATERIAL_PRICES.filter(
  (p) => p.tab === '物料' && p.category === '五金' && p.status === '有效',
);

/** 按名称在价格库中查找物料行（名称越长的命中优先） */
export function findHardwareCatalogItem(searchName: string): PriceItem | null {
  const n = searchName.trim();
  if (!n) return null;

  const exactList = hardwareCatalogList.filter((p) => p.name === n);
  if (exactList.length === 1) return exactList[0];
  if (exactList.length > 1) {
    const black = exactList.find((p) => p.colorCategory === '黑色');
    if (black) return black;
    const noColor = exactList.find((p) => !p.colorCategory?.trim());
    if (noColor) return noColor;
    exactList.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'zh-CN'));
    return exactList[0];
  }

  const includes = hardwareCatalogList.filter((p) => p.name.includes(n) || n.includes(p.name));
  if (includes.length === 0) return null;
  includes.sort((a, b) => b.name.length - a.name.length);
  return includes[0];
}

export function lookupHardwareUnitPrice(name: string, tier: HardwarePriceTier): number | null {
  const item = findHardwareCatalogItem(name);
  if (!item) return null;
  return pickTierPrice(item, tier);
}

/** 导入或批量：按对照表档位写回单价（能匹配到价格库才覆盖） */
export function applyHardwarePricesFromColorMap(
  items: CostSheetHardwareItem[],
  colorMap: ColorMaterialMapEntry[] | undefined | null,
): CostSheetHardwareItem[] {
  const { tier } = resolveHardwareTierFromColorMap(colorMap);
  return items.map((row) => {
    const cat = findHardwareCatalogItem(row.name);
    const p = cat ? pickTierPrice(cat, tier) : null;
    if (p == null || !cat) return row;
    return {
      ...row,
      unit_price: p,
      material_code: row.material_code ?? (cat.code ? String(cat.code) : null),
    };
  });
}

/** 单价列表头旁展示的档位名（与价格表列头一致），如「浅金/白呖」 */
export function getHardwarePriceHeaderBadgeText(
  colorMap: ColorMaterialMapEntry[] | undefined | null,
): string {
  return resolveHardwareTierFromColorMap(colorMap).columnLabel;
}

/** 完整说明（作 title） */
export function getHardwarePriceHeaderTitle(colorMap: ColorMaterialMapEntry[] | undefined | null): string {
  const { columnLabel, finishRaw } = resolveHardwareTierFromColorMap(colorMap);
  const base = `五金单价来自「供应商管理 → 价格管理」物料库，对应该档「${columnLabel}」列。`;
  if (finishRaw) {
    return `${base} 颜色物料对照表第一行「五金」类列为「${finishRaw}」。`;
  }
  return `${base} 对照表首行未填五金颜色时，默认按「${MATERIAL_PRICE_COLUMNS[0]}」列。`;
}
