/* ============================================================
 * 套装产品管理 — 模拟数据
 * 说明: 套装（Set）是由若干纸格款号（Pattern）组合而成的销售单元
 *       后续接入 Supabase 后替换为真实数据
 * ============================================================ */

import { COLOR_MAP, COLOR_NAME_ZH_MAP } from '../../products/_components/mockData';
export { COLOR_MAP };

/** 套装颜色 SKU（每个颜色对应一条 SKU） */
export interface SetSkuItem {
  id: string;
  /** SKU 编号，如 CITYBAG-3SET-BLK */
  skuCode: string;
  colorCode: string;
  /** 颜色中文名（可选，优先用 COLOR_NAME_ZH_MAP 填充） */
  colorNameZh?: string;
  stock: number;
  status: 'active' | 'discontinued';
  updatedAt: string;
}

/** 套装列表数据结构 */
export interface SetItem {
  id: string;
  /** 套装 SKU 编号，如 CITYBAG-3SET */
  sku: string;
  name: string;
  imageUrl: string | null;
  /** 包含的纸格款号列表 */
  components: string[];
  colors: string[];
  /** 每个颜色对应的 SKU 详情 */
  skus: SetSkuItem[];
  bulkPrice: number;
  dropshipPrice: number;
  currency: string;
  packWeight: string;
  packSize: string;
  status: 'active' | 'discontinued';
  createdAt: string;
}

/** 生成日期字符串 */
function d(y: number, m: number, day: number) {
  return `${y}/${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

/** 根据字符串生成伪随机库存数（同参数每次结果一致） */
function pseudoStock(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return 50 + Math.abs(h % 200);
}

/** 为套装生成颜色 SKU 列表 */
function generateSetSkus(setId: string, setSku: string, colors: string[], baseDate: string): SetSkuItem[] {
  return colors.map((colorCode, idx) => ({
    id: `${setId}-sku-${idx}`,
    skuCode: `${setSku}-${colorCode}`,
    colorCode,
    colorNameZh: COLOR_NAME_ZH_MAP[colorCode],
    stock: pseudoStock(`${setSku}-${colorCode}`),
    status: 'active' as const,
    updatedAt: baseDate,
  }));
}

const BASE_SETS: Omit<SetItem, 'skus'>[] = [
  {
    id: 's001',
    sku: 'CITYBAG-3SET',
    name: '城市包三件套',
    imageUrl: null,
    components: ['CITYBAG-AP1', 'CROSS-2024-05', 'WALLET-2024-07'],
    colors: ['BLK', 'BRN', 'NAV', 'TAN'],
    bulkPrice: 24.50,
    dropshipPrice: 29.00,
    currency: 'USD',
    packWeight: '1.60 kg',
    packSize: '30×22×15 cm',
    status: 'active',
    createdAt: d(2024, 3, 10),
  },
  {
    id: 's002',
    sku: 'TRAVEL-3SET',
    name: '旅行三件套',
    imageUrl: null,
    components: ['WEEKENDER-2024-14', 'PASSPORT-2024-17', 'POUCH-2024-15'],
    colors: ['BLK', 'BRN', 'KHK', 'NAV'],
    bulkPrice: 26.00,
    dropshipPrice: 31.00,
    currency: 'USD',
    packWeight: '2.10 kg',
    packSize: '58×32×26 cm',
    status: 'active',
    createdAt: d(2024, 3, 20),
  },
  {
    id: 's003',
    sku: 'OFFICE-3SET',
    name: '商务三件套',
    imageUrl: null,
    components: ['BRIEFCASE-2024-12', 'WALLET-2024-07', 'CARD-2024-08'],
    colors: ['BLK', 'BRN', 'NAV'],
    bulkPrice: 23.10,
    dropshipPrice: 27.50,
    currency: 'USD',
    packWeight: '1.80 kg',
    packSize: '42×32×12 cm',
    status: 'active',
    createdAt: d(2024, 4, 5),
  },
  {
    id: 's004',
    sku: 'FASHION-4SET',
    name: '时尚四件套',
    imageUrl: null,
    components: ['TOTE-2024-02', 'CROSS-2024-05', 'COINPURSE-2024-13', 'KEYHOLDER-2024-16'],
    colors: ['BGE', 'PNK', 'LBL', 'CRM'],
    bulkPrice: 17.80,
    dropshipPrice: 21.50,
    currency: 'USD',
    packWeight: '1.50 kg',
    packSize: '35×30×16 cm',
    status: 'active',
    createdAt: d(2024, 4, 15),
  },
  {
    id: 's005',
    sku: 'DAILY-2SET',
    name: '日常两件套',
    imageUrl: null,
    components: ['SHOULDER-2024-06', 'WALLET-2024-07'],
    colors: ['BLK', 'RED', 'NAV', 'LPK'],
    bulkPrice: 12.00,
    dropshipPrice: 14.80,
    currency: 'USD',
    packWeight: '0.75 kg',
    packSize: '30×12×20 cm',
    status: 'discontinued',
    createdAt: d(2024, 4, 25),
  },
  {
    id: 's006',
    sku: 'BACKPACK-2SET',
    name: '双肩包两件套',
    imageUrl: null,
    components: ['BACKPACK-2024-04', 'POUCH-2024-15'],
    colors: ['BLK', 'BLU', 'GRN', 'NAV'],
    bulkPrice: 13.40,
    dropshipPrice: 16.00,
    currency: 'USD',
    packWeight: '1.05 kg',
    packSize: '32×17×48 cm',
    status: 'active',
    createdAt: d(2024, 5, 8),
  },
  {
    id: 's007',
    sku: 'MINI-3SET',
    name: '迷你包三件套',
    imageUrl: null,
    components: ['MINI-2024-11', 'WRISTLET-2024-23', 'COINPURSE-2024-13'],
    colors: ['PNK', 'LBL', 'CRM', 'WHT'],
    bulkPrice: 11.30,
    dropshipPrice: 13.80,
    currency: 'USD',
    packWeight: '0.44 kg',
    packSize: '22×15×8 cm',
    status: 'active',
    createdAt: d(2024, 5, 18),
  },
  {
    id: 's008',
    sku: 'DUFFLE-2SET',
    name: '旅行包两件套',
    imageUrl: null,
    components: ['DUFFLE-2024-03', 'PASSPORT-2024-17'],
    colors: ['BLK', 'NAV', 'BRN', 'GRN'],
    bulkPrice: 15.70,
    dropshipPrice: 18.80,
    currency: 'USD',
    packWeight: '1.32 kg',
    packSize: '47×27×24 cm',
    status: 'active',
    createdAt: d(2024, 6, 2),
  },
  {
    id: 's009',
    sku: 'WALLET-3SET',
    name: '钱包三件套',
    imageUrl: null,
    components: ['WALLET-2024-07', 'CARD-2024-08', 'COINPURSE-2024-13'],
    colors: ['BLK', 'BRN', 'TAN', 'WNE'],
    bulkPrice: 10.10,
    dropshipPrice: 12.20,
    currency: 'USD',
    packWeight: '0.32 kg',
    packSize: '22×12×5 cm',
    status: 'active',
    createdAt: d(2024, 6, 14),
  },
  {
    id: 's010',
    sku: 'CLUTCH-2SET',
    name: '手拿包两件套',
    imageUrl: null,
    components: ['CLUTCH-2024-10', 'WRISTLET-2024-23'],
    colors: ['BLK', 'WNE', 'NAV', 'PNK'],
    bulkPrice: 8.70,
    dropshipPrice: 11.30,
    currency: 'USD',
    packWeight: '0.46 kg',
    packSize: '27×17×6 cm',
    status: 'active',
    createdAt: d(2024, 6, 28),
  },
  {
    id: 's011',
    sku: 'HOBO-2SET',
    name: '半月包两件套',
    imageUrl: null,
    components: ['HOBO-2024-21', 'COINPURSE-2024-13'],
    colors: ['CML', 'TAN', 'GRY', 'BRN'],
    bulkPrice: 10.00,
    dropshipPrice: 12.30,
    currency: 'USD',
    packWeight: '0.62 kg',
    packSize: '37×27×14 cm',
    status: 'discontinued',
    createdAt: d(2024, 7, 10),
  },
  {
    id: 's012',
    sku: 'BUCKET-2SET',
    name: '水桶包两件套',
    imageUrl: null,
    components: ['BUCKET-2024-18', 'CARD-2024-08'],
    colors: ['BLK', 'CML', 'WNE', 'GRN'],
    bulkPrice: 11.70,
    dropshipPrice: 14.40,
    currency: 'USD',
    packWeight: '0.75 kg',
    packSize: '24×24×30 cm',
    status: 'active',
    createdAt: d(2024, 7, 22),
  },
  {
    id: 's013',
    sku: 'SATCHEL-2SET',
    name: '剑桥包两件套',
    imageUrl: null,
    components: ['SATCHEL-2024-19', 'WALLET-2024-07'],
    colors: ['BRN', 'BLK', 'TAN', 'WNE'],
    bulkPrice: 14.30,
    dropshipPrice: 17.30,
    currency: 'USD',
    packWeight: '0.95 kg',
    packSize: '30×22×12 cm',
    status: 'active',
    createdAt: d(2024, 8, 5),
  },
  {
    id: 's014',
    sku: 'FANNY-2SET',
    name: '腰包两件套',
    imageUrl: null,
    components: ['FANNY-2024-22', 'KEYHOLDER-2024-16'],
    colors: ['BLK', 'GRN', 'NAV', 'KHK'],
    bulkPrice: 8.00,
    dropshipPrice: 10.60,
    currency: 'USD',
    packWeight: '0.36 kg',
    packSize: '32×16×10 cm',
    status: 'active',
    createdAt: d(2024, 8, 19),
  },
  {
    id: 's015',
    sku: 'BELT-2SET',
    name: '皮带两件套',
    imageUrl: null,
    components: ['BELT-2024-09', 'CARD-2024-08'],
    colors: ['BLK', 'BRN', 'TAN'],
    bulkPrice: 6.40,
    dropshipPrice: 8.70,
    currency: 'USD',
    packWeight: '0.35 kg',
    packSize: '125×10×3 cm',
    status: 'active',
    createdAt: d(2024, 9, 3),
  },
  {
    id: 's016',
    sku: 'LAPTOP-2SET',
    name: '电脑包两件套',
    imageUrl: null,
    components: ['LAPTOP-2025-01', 'POUCH-2024-15'],
    colors: ['BLK', 'GRY', 'NAV'],
    bulkPrice: 9.70,
    dropshipPrice: 12.50,
    currency: 'USD',
    packWeight: '0.49 kg',
    packSize: '38×28×5 cm',
    status: 'active',
    createdAt: d(2024, 9, 20),
  },
  {
    id: 's017',
    sku: 'ZIPHOODIE-3SET',
    name: '拉链钱包三件套',
    imageUrl: null,
    components: ['ZIPWALLET-2024-20', 'CARD-2024-08', 'KEYHOLDER-2024-16'],
    colors: ['BLK', 'BRN', 'NAV', 'PNK', 'WNE'],
    bulkPrice: 10.60,
    dropshipPrice: 14.20,
    currency: 'USD',
    packWeight: '0.36 kg',
    packSize: '21×12×4 cm',
    status: 'active',
    createdAt: d(2024, 10, 8),
  },
  {
    id: 's018',
    sku: 'TOTE-2SET',
    name: '托特包两件套',
    imageUrl: null,
    components: ['TOTE-2024-02', 'COINPURSE-2024-13'],
    colors: ['BGE', 'PNK', 'GRN', 'LBL'],
    bulkPrice: 10.20,
    dropshipPrice: 12.30,
    currency: 'USD',
    packWeight: '0.67 kg',
    packSize: '34×30×16 cm',
    status: 'active',
    createdAt: d(2024, 10, 25),
  },
  {
    id: 's019',
    sku: 'GIFT-5SET',
    name: '礼品五件套',
    imageUrl: null,
    components: ['MINI-2024-11', 'WRISTLET-2024-23', 'CARD-2024-08', 'COINPURSE-2024-13', 'KEYHOLDER-2024-16'],
    colors: ['PNK', 'LBL', 'CRM', 'BLK'],
    bulkPrice: 15.10,
    dropshipPrice: 18.50,
    currency: 'USD',
    packWeight: '0.64 kg',
    packSize: '24×18×8 cm',
    status: 'active',
    createdAt: d(2024, 11, 12),
  },
  {
    id: 's020',
    sku: 'PREMIER-5SET',
    name: '精品五件套',
    imageUrl: null,
    components: ['BRIEFCASE-2024-12', 'WALLET-2024-07', 'CARD-2024-08', 'BELT-2024-09', 'KEYHOLDER-2024-16'],
    colors: ['BLK', 'BRN'],
    bulkPrice: 29.90,
    dropshipPrice: 35.80,
    currency: 'USD',
    packWeight: '2.12 kg',
    packSize: '44×34×12 cm',
    status: 'active',
    createdAt: d(2024, 11, 28),
  },
  {
    id: 's021',
    sku: 'CROSS-2SET',
    name: '斜挎包两件套',
    imageUrl: null,
    components: ['CROSS-2024-05', 'COINPURSE-2024-13'],
    colors: ['BRN', 'TAN', 'BLK', 'PNK'],
    bulkPrice: 8.60,
    dropshipPrice: 10.40,
    currency: 'USD',
    packWeight: '0.52 kg',
    packSize: '22×17×10 cm',
    status: 'active',
    createdAt: d(2024, 12, 8),
  },
  {
    id: 's022',
    sku: 'PASSPORT-2SET',
    name: '护照包两件套',
    imageUrl: null,
    components: ['PASSPORT-2024-17', 'KEYHOLDER-2024-16'],
    colors: ['BLK', 'BRN', 'NAV', 'WNE'],
    bulkPrice: 6.00,
    dropshipPrice: 8.10,
    currency: 'USD',
    packWeight: '0.18 kg',
    packSize: '16×12×4 cm',
    status: 'active',
    createdAt: d(2024, 12, 20),
  },
  {
    id: 's023',
    sku: 'MEGA-7SET',
    name: '全能七件套',
    imageUrl: null,
    components: ['CITYBAG-AP1', 'CROSS-2024-05', 'WALLET-2024-07', 'CARD-2024-08', 'COINPURSE-2024-13', 'KEYHOLDER-2024-16', 'POUCH-2024-15'],
    colors: ['BLK', 'BRN', 'NAV'],
    bulkPrice: 38.50,
    dropshipPrice: 45.00,
    currency: 'USD',
    packWeight: '2.38 kg',
    packSize: '35×25×18 cm',
    status: 'active',
    createdAt: d(2025, 1, 6),
  },
  {
    id: 's024',
    sku: 'NEWMOM-4SET',
    name: '妈咪四件套',
    imageUrl: null,
    components: ['TOTE-2024-02', 'POUCH-2024-15', 'COINPURSE-2024-13', 'KEYHOLDER-2024-16'],
    colors: ['BGE', 'PNK', 'LBL', 'CRM'],
    bulkPrice: 15.00,
    dropshipPrice: 18.00,
    currency: 'USD',
    packWeight: '0.90 kg',
    packSize: '35×30×16 cm',
    status: 'active',
    createdAt: d(2025, 1, 20),
  },
  {
    id: 's025',
    sku: 'TRAVEL-LITE-2SET',
    name: '轻旅两件套',
    imageUrl: null,
    components: ['FANNY-2024-22', 'PASSPORT-2024-17'],
    colors: ['BLK', 'GRN', 'NAV', 'ORG'],
    bulkPrice: 9.60,
    dropshipPrice: 12.50,
    currency: 'USD',
    packWeight: '0.40 kg',
    packSize: '32×16×10 cm',
    status: 'active',
    createdAt: d(2025, 2, 5),
  },
];

/** skus 字段由 generateSetSkus 自动填充 */
export const MOCK_SETS: SetItem[] = BASE_SETS.map((s) => ({
  ...s,
  skus: generateSetSkus(s.id, s.sku, s.colors, s.createdAt),
}));

export const SET_STATUS_OPTIONS = ['全部状态', '启用', '停用'] as const;

export const CURRENCY_OPTIONS = ['USD', 'CNY', 'EUR', 'GBP'] as const;

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
};
