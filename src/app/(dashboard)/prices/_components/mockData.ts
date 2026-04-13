/* ============================================================
 * 价格管理 — 类型定义与常量
 * ============================================================ */

export type PriceTab = '物料' | '工艺';
export type PriceStatus = '有效' | '无效';

export interface PriceItem {
  id: string;
  tab: PriceTab;
  /** 类型 — 表格第一列（如 TC嘴头、TC嘴头方形草写） */
  materialType: string;
  code: string;
  name: string;
  image?: string;
  unit: string;
  /** 物料分类 / 工艺分类（一级）*/
  category: string;
  /** 二级子分类（目前仅五金有）*/
  subCategory?: string;
  spec: string;
  brand: string;
  supplierId: string;
  supplierName: string;
  /** 物料：浅金白啤 / 工艺：工价 */
  price1: number | null;
  /** 物料：镀金 / 工艺：加急价 */
  price2: number | null;
  /** 其他 */
  price3: number | null;
  remark: string;
  status: PriceStatus;
  createdAt: string;
}

/**
 * 一级分类 → 二级子分类映射
 * 有配置的分类才会在价格管理页面出现第二行子类筛选
 */
export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  '五金': ['特殊五金', '常规五金', '拉链', '铁链', '磁扣'],
};

/** 物料价格表列头 */
export const MATERIAL_PRICE_COLUMNS = ['浅金/白呖', '鎏金', '其他'] as const;
/** 工艺价格表列头 */
export const PROCESS_PRICE_COLUMNS = ['工价', '加急价', '其他'] as const;

/** 价格表中引用的供应商（快捷筛选用） */
export interface PriceSupplier {
  id: string;
  name: string;
}

export const PRICE_SUPPLIERS_MATERIAL: PriceSupplier[] = [];

export const PRICE_SUPPLIERS_PROCESS: PriceSupplier[] = [];

export const BRANDS = ['TC', 'YKK', '立新', '国标', '东洋', '无品牌'] as const;

export const MOCK_MATERIAL_PRICES: PriceItem[] = [];
export const MOCK_PROCESS_PRICES: PriceItem[] = [];
export const ALL_MOCK_PRICES: PriceItem[] = [];
