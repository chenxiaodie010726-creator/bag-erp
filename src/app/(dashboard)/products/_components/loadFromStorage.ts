/* ============================================================
 * 列表页与详情页共用：从 localStorage 或 MOCK 按 id 取单条
 * ============================================================ */

import { MOCK_PRODUCTS, type ProductListItem } from './mockData';
import { MOCK_SETS, type SetItem } from '../../sets/_components/mockData';

export const PRODUCTS_STORAGE_KEY = 'cf_erp_products';
export const SETS_STORAGE_KEY = 'cf_erp_sets';

export function loadProductById(id: string): ProductListItem | null {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(PRODUCTS_STORAGE_KEY) : null;
    const list: ProductListItem[] = stored ? JSON.parse(stored) : MOCK_PRODUCTS;
    return list.find((p) => p.id === id) ?? MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
  } catch {
    return MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
  }
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
