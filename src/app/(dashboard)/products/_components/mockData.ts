/* ============================================================
 * 产品列表 — 模拟数据（测试用：仅 1 条）
 * 说明: 数据结构与 supabase/schema.sql 中的 patterns + skus 表一致
 *       后续接入 Supabase 后替换为真实数据
 * ============================================================ */

/** 颜色色值映射（用于颜色圆点展示） */
export const COLOR_MAP: Record<string, string> = {
  BLK: '#1a1a1a',
  BLU: '#2563eb',
  RED: '#dc2626',
  BRN: '#78350f',
  TAN: '#d2b48c',
  GRN: '#16a34a',
  NAV: '#1e3a5f',
  GRY: '#6b7280',
  WHT: '#f5f5f4',
  PNK: '#ec4899',
  ORG: '#ea580c',
  BGE: '#d4c5a9',
  CML: '#c4956a',
  OLV: '#556b2f',
  WNE: '#722f37',
  CRM: '#fffdd0',
  KHK: '#c3b091',
  LBL: '#93c5fd',
  DBR: '#4a2c0a',
  LPK: '#fbb6ce',
};

/** 颜色代码 → 英文名称 */
export const COLOR_NAME_MAP: Record<string, string> = {
  BLK: 'Black',
  BLU: 'Blue',
  RED: 'Red',
  BRN: 'Brown',
  TAN: 'Tan',
  GRN: 'Green',
  NAV: 'Navy',
  GRY: 'Gray',
  WHT: 'White',
  PNK: 'Pink',
  ORG: 'Orange',
  BGE: 'Beige',
  CML: 'Camel',
  OLV: 'Olive',
  WNE: 'Wine',
  CRM: 'Cream',
  KHK: 'Khaki',
  LBL: 'Light Blue',
  DBR: 'Dark Brown',
  LPK: 'Light Pink',
};

/** 颜色代码 → 中文名称（常用预设，可在添加 SKU 时自动填入） */
export const COLOR_NAME_ZH_MAP: Record<string, string> = {
  BLK: '黑色',
  BLU: '蓝色',
  RED: '红色',
  BRN: '棕色',
  TAN: '卡其棕',
  GRN: '绿色',
  NAV: '藏青色',
  GRY: '灰色',
  WHT: '白色',
  PNK: '粉色',
  ORG: '橙色',
  BGE: '米色',
  CML: '驼色',
  OLV: '军绿色',
  WNE: '酒红色',
  CRM: '奶油色',
  KHK: '卡其色',
  LBL: '浅蓝色',
  DBR: '深棕色',
  LPK: '浅粉色',
};

/** SKU 子项数据 */
export interface SkuItem {
  id: string;
  skuName: string;           // 如 CITYBAG-AP1-BLK（客户提供）
  colorCode: string;         // 颜色代码，如 BLK / #ff5500（客户提供）
  colorNameZh?: string;      // 颜色中文名称，如 黑色（可选，方便内部识别）
  /** 订单/导入的「颜色」列原文（如 BLACK），用于颜色管理词根匹配色块 */
  colorPhrase?: string | null;
  skuCode: string;           // SKU Code 如 SKU001-BLK（客户提供）
  stock: number;             // 库存
  bulkPrice: number;
  dropshipPrice: number;
  status: 'active' | 'discontinued';
  updatedAt: string;
}

/** 产品列表视图数据（Pattern 维度，包含所属 SKU） */
export interface ProductListItem {
  id: string;
  patternCode: string;
  /** 套装：多个纸格款号（与 SKU 件数一致）；展示/合并时 patternCode 多为「款1 · 款2 · …」 */
  patternCodesMulti?: string[];
  /** 套装件数（与 SKU 首段横杠后数字一致，保存时写入便于识别） */
  setPieceCount?: number;
  /** 套装按件单价记忆（与件数对齐；可选） */
  setPiecePrices?: { bulk: number; dropship: number }[];
  /** 疑似套装页「核对 SKU」列（与件数对齐；可选） */
  setChildSkuLookups?: string[];
  /** 内部款式名称（与纸格款号同属一款）；非客户订单里的 Style Name（后者按 SKU 一行一个） */
  name: string;
  category: string;
  imageUrl: string | null;
  /** 详情页按颜色维护的多图（data URL），与 imageUrl 在保存时同步 */
  productImagesByColor?: Record<string, string[]>;
  colors: string[];
  bulkPrice: number;
  dropshipPrice: number;
  currency: string;
  packWeight: string;
  packSize: string;
  status: 'active' | 'discontinued';
  createdAt: string;
  skuCount: number;
  skus: SkuItem[];
}

/* ============================================================
 * 测试数据：1 个产品，含 1 个已注册 SKU（TEST-RALLY-GRN）
 * 订单中出现该 SKU 时不会进入「未录入」
 * ============================================================ */
export const MOCK_PRODUCTS: ProductListItem[] = [
  {
    id: 'p-test-001',
    patternCode: 'RALLY-01',
    name: 'RALLY SHOULDER BAG',
    category: '手袋',
    imageUrl: null,
    colors: ['GRN'],
    bulkPrice: 13.00,
    dropshipPrice: 15.86,
    currency: 'USD',
    packWeight: '0.50 kg',
    packSize: '30×22×10 cm',
    status: 'active',
    createdAt: '2026/04/01',
    skuCount: 1,
    skus: [
      {
        id: 'sku-rally-grn',
        skuName: 'RALLY-01-GRN',
        colorCode: 'GRN',
        colorNameZh: '绿色',
        colorPhrase: 'GREEN',
        skuCode: 'TEST-RALLY-GRN',
        stock: 0,
        bulkPrice: 13.00,
        dropshipPrice: 15.86,
        status: 'active',
        updatedAt: '2026/04/01',
      },
    ],
  },
];

/** 所有分类选项 */
export const CATEGORY_OPTIONS = ['全部', '手袋', '钱包', '皮带', '卡包', '其他'] as const;

/** 所有状态选项 */
export const STATUS_OPTIONS = ['全部状态', '启用', '停用', '待补全', '部分未补全'] as const;
