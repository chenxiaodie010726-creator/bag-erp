/* ============================================================
 * 列表页与详情页共用：从 localStorage 或 MOCK 按 id 取单条
 * ============================================================ */

import { MOCK_PRODUCTS, type ProductListItem } from './mockData';
import { MOCK_SETS, type SetItem } from '../../sets/_components/mockData';

export const PRODUCTS_STORAGE_KEY = 'cf_erp_products';
export const SETS_STORAGE_KEY = 'cf_erp_sets';

function readProductList(): ProductListItem[] {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(PRODUCTS_STORAGE_KEY) : null;
    if (stored) {
      const parsed = JSON.parse(stored) as ProductListItem[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [...MOCK_PRODUCTS];
}

export function loadProductById(id: string): ProductListItem | null {
  try {
    const list = readProductList();
    return list.find((p) => p.id === id) ?? MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
  } catch {
    return MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
  }
}

/** 按纸格款号匹配单品管理中的款式（与成本核算表 pattern_code 对应） */
export function loadProductByPatternCode(patternCode: string): ProductListItem | null {
  const code = patternCode?.trim();
  if (!code) return null;
  const upper = code.toUpperCase();
  try {
    const list = readProductList();
    return (
      list.find((p) => p.patternCode.trim().toUpperCase() === upper) ??
      MOCK_PRODUCTS.find((p) => p.patternCode.trim().toUpperCase() === upper) ??
      null
    );
  } catch {
    return MOCK_PRODUCTS.find((p) => p.patternCode.trim().toUpperCase() === upper) ?? null;
  }
}

/** 写回产品列表（与列表页、详情页共用） */
export function saveProduct(product: ProductListItem): void {
  if (typeof window === 'undefined') return;
  const list = readProductList();
  const idx = list.findIndex((p) => p.id === product.id);
  if (idx >= 0) list[idx] = product;
  else list.unshift(product);
  try {
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(list));
  } catch { /* quota */ }
}

export function loadSetById(id: string): SetItem | null {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(SETS_STORAGE_KEY) : null;
    const list: SetItem[] = stored ? JSON.parse(stored) : MOCK_SETS;
    return list.find((s) => s.id === id) ?? MOCK_SETS.find((s) => s.id === id) ?? null;
  } catch {
    return MOCK_SETS.find((s) => s.id === id) ?? null;
  }
}
