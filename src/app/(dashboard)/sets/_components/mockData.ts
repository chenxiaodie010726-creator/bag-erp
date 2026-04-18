/* ============================================================
 * 套装产品管理 — 模拟数据（测试用：1 条）
 * ============================================================ */

export { COLOR_MAP, COLOR_NAME_MAP, COLOR_NAME_ZH_MAP } from '../../products/_components/mockData';

/** 套装颜色 SKU（每个颜色对应一条 SKU） */
export interface SetSkuItem {
  id: string;
  skuCode: string;
  colorCode: string;
  colorNameZh?: string;
  stock: number;
  status: 'active' | 'discontinued';
  updatedAt: string;
}

/** 套装列表数据结构 */
export interface SetItem {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  components: string[];
  colors: string[];
  skus: SetSkuItem[];
  bulkPrice: number;
  dropshipPrice: number;
  currency: string;
  packWeight: string;
  packSize: string;
  status: 'active' | 'discontinued';
  createdAt: string;
}

/* ============================================================
 * 测试数据：1 个套装
 * 包含 RALLY-01 + 配件（概念组合），有绿色和黑色两个 SKU
 * 套装 SKU 将被 skuLookup 识别为「已注册」
 * ============================================================ */
export const MOCK_SETS: SetItem[] = [];

export const SET_STATUS_OPTIONS = ['全部状态', '启用', '停用'] as const;

export const CURRENCY_OPTIONS = ['USD', 'CNY', 'EUR', 'GBP'] as const;

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
};
