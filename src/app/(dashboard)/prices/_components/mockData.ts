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
  /** 幅宽（如 54英寸），用于面料/里布/面布等「布类」行 */
  fabricWidth?: string | null;
  /**
   * 颜色/规格（如 黑色、杂色），与编号共同唯一；用于五金等差异化定价
   * 空字符串视为「未区分」单行展示
   */
  colorCategory?: string | null;
  /**
   * 同义词（与颜色管理相同分隔符：逗号、顿号、分号等）
   * 用于五金：历史叫法映射到当前名称，英文匹配不区分大小写
   */
  synonyms?: string | null;
  remark: string;
  status: PriceStatus;
  createdAt: string;
}

/**
 * 一级分类 → 二级子分类映射
 * 有配置的分类才会在价格管理页面出现第二行子类筛选
 */
export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  /** 拉链类细分为：拉头 → 拉链 → 条状拉链 → 拉牌 */
  '五金': ['特殊五金', '常规五金', '拉头', '拉链', '条状拉链', '拉牌', '铁链', '磁扣'],
};

/** 物料价格表列头（五金等非面料分类） */
export const MATERIAL_PRICE_COLUMNS = ['浅金/白呖', '鎏金', '其他'] as const;
/** 布类物料（面料/里布/面布等）：常规价 + 其他 + 幅宽（无鎏金列） */
export const MATERIAL_FABRIC_TABLE_HEADERS = ['常规价', '其他', '幅宽'] as const;

/** 使用上表「常规价/其他/幅宽」的物料一级分类（与五金三档价区分；含「面布」以兼容旧数据） */
export const MATERIAL_TEXTILE_STYLE_CATEGORIES = ['面料', '里布', '面布'] as const;

export function isMaterialTextileStyleCategory(category: string): boolean {
  return (MATERIAL_TEXTILE_STYLE_CATEGORIES as readonly string[]).includes(category);
}

/** 导入/表单：颜色/规格预设（可扩展） */
export const PRICE_COLOR_CATEGORY_PRESETS = ['黑色', '杂色'] as const;

/** 编号 + 颜色/规格 在物料 Tab 内唯一（空颜色不参与与有值行的互斥，仅同空唯一） */
export function priceDuplicateKey(p: Pick<PriceItem, 'code' | 'colorCategory'>): string {
  const c = (p.colorCategory ?? '').trim();
  return `${p.code.trim()}\0${c}`;
}
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
