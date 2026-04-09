/* ============================================================
 * 价格管理 — 模拟数据
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

export const PRICE_SUPPLIERS_MATERIAL: PriceSupplier[] = [
  { id: 'ps_hzy', name: '海之洋' },
  { id: 'ps_lckj', name: '联创五金' },
  { id: 'ps_hysj', name: '宏远塑胶' },
  { id: 'ps_tcwj', name: '天成五金' },
  { id: 'ps_xrdz', name: '旭日电子' },
  { id: 'ps_mhwj', name: '明辉五金' },
  { id: 'ps_hxmy', name: '华信贸易' },
  { id: 'ps_ysml', name: '永盛面料' },
  { id: 'ps_jxfz', name: '锦绣纺织' },
  { id: 'ps_hdfl', name: '鸿达辅料' },
  { id: 'ps_sdbz', name: '顺达包装' },
];

export const PRICE_SUPPLIERS_PROCESS: PriceSupplier[] = [
  { id: 'ps_dlyh', name: '德力印花' },
  { id: 'ps_jgfr', name: '精工缝纫' },
  { id: 'ps_htdd', name: '恒通电镀' },
  { id: 'ps_zhpy', name: '振华皮艺' },
  { id: 'ps_jmxh', name: '锦美绣花' },
  { id: 'ps_hyym', name: '宏益压唛' },
];

export const BRANDS = ['TC', 'YKK', '立新', '国标', '东洋', '无品牌'] as const;

/* ============================================================
 * 物料价格数据（≈60 条，以五金为主）
 * ============================================================ */
export const MOCK_MATERIAL_PRICES: PriceItem[] = [
  // ---- 五金·特殊五金 - 海之洋 ----
  { id: 'mp_001', tab: '物料', materialType: 'TC嘴头', code: 'TC-0001', name: 'TC嘴头草写圆角', unit: '个', category: '五金', subCategory: '特殊五金', spec: '标准', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.86, price2: 1.16, price3: 1.10, remark: '', status: '有效', createdAt: '2024-06-01' },
  { id: 'mp_002', tab: '物料', materialType: 'TC嘴头', code: 'TC-0002', name: 'TC嘴头草写尖角', unit: '个', category: '五金', subCategory: '特殊五金', spec: '标准', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.80, price2: 1.04, price3: 1.25, remark: '', status: '有效', createdAt: '2024-06-01' },
  { id: 'mp_003', tab: '物料', materialType: 'TC嘴头', code: 'TC-0003', name: 'TC嘴头草写超小', unit: '个', category: '五金', subCategory: '特殊五金', spec: '1.8cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: null, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-06-01' },
  { id: 'mp_004', tab: '物料', materialType: 'TC嘴头圆圆草写', code: 'TC-0004', name: 'TC嘴头圆圆草写小号', unit: '个', category: '五金', subCategory: '特殊五金', spec: '1cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 1.80, price2: 2.30, price3: 2.80, remark: '', status: '有效', createdAt: '2024-06-05' },
  { id: 'mp_005', tab: '物料', materialType: 'TC嘴头圆圆草写', code: 'TC-0005', name: 'TC嘴头圆圆草写大号', unit: '个', category: '五金', subCategory: '特殊五金', spec: '4cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.90, price2: 1.20, price3: 1.50, remark: '', status: '有效', createdAt: '2024-06-05' },
  { id: 'mp_006', tab: '物料', materialType: 'TC嘴头方形草写', code: 'TC-0006', name: 'TC嘴头方形草写-圆钉嘴5*5.5cm', unit: '个', category: '五金', subCategory: '特殊五金', spec: '5*5.5cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 2.80, price2: 3.60, price3: 4.20, remark: '全电镀3.3', status: '有效', createdAt: '2024-06-10' },
  { id: 'mp_007', tab: '物料', materialType: 'TC嘴头方形草写', code: 'TC-0007', name: 'TC嘴头方形草写4*4cm', unit: '个', category: '五金', subCategory: '特殊五金', spec: '4*4cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.68, price2: 0.98, price3: 1.20, remark: '', status: '有效', createdAt: '2024-06-10' },
  { id: 'mp_008', tab: '物料', materialType: 'TC嘴头方形草写', code: 'TC-0008', name: 'TC嘴头方形草写3*3cm', unit: '个', category: '五金', subCategory: '特殊五金', spec: '3*3cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.50, price2: 0.72, price3: 0.90, remark: '', status: '有效', createdAt: '2024-06-10' },
  { id: 'mp_009', tab: '物料', materialType: 'TC嘴头方形草写', code: 'TC-0009', name: 'TC嘴头方形草写2.5*3cm', unit: '个', category: '五金', subCategory: '特殊五金', spec: '2.5*3cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.48, price2: 0.70, price3: 0.85, remark: '', status: '有效', createdAt: '2024-06-10' },
  { id: 'mp_010', tab: '物料', materialType: 'TC拉牌', code: 'TC-0010', name: 'TC锁头字牌', unit: '个', category: '五金', subCategory: '特殊五金', spec: '标准', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.88, price2: 1.13, price3: 1.35, remark: '立新一套价格', status: '有效', createdAt: '2024-06-15' },
  { id: 'mp_011', tab: '物料', materialType: 'TC拉牌', code: 'TC-0011', name: 'TC方形拉牌大', unit: '个', category: '五金', subCategory: '特殊五金', spec: '3*2cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.65, price2: 0.85, price3: 1.05, remark: '', status: '有效', createdAt: '2024-06-15' },
  { id: 'mp_012', tab: '物料', materialType: 'TC拉牌', code: 'TC-0012', name: 'TC圆形拉牌', unit: '个', category: '五金', subCategory: '特殊五金', spec: '直径2cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.55, price2: 0.78, price3: 0.95, remark: '', status: '有效', createdAt: '2024-06-15' },

  // ---- 五金·常规五金 - 海之洋 ----
  { id: 'mp_013', tab: '物料', materialType: 'D扣', code: 'TC-0013', name: 'D扣合金2cm', unit: '个', category: '五金', subCategory: '常规五金', spec: '2cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.35, price2: 0.52, price3: 0.60, remark: '', status: '有效', createdAt: '2024-07-01' },
  { id: 'mp_014', tab: '物料', materialType: 'D扣', code: 'TC-0014', name: 'D扣合金2.5cm', unit: '个', category: '五金', subCategory: '常规五金', spec: '2.5cm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.42, price2: 0.58, price3: 0.72, remark: '', status: '有效', createdAt: '2024-07-01' },
  { id: 'mp_017', tab: '物料', materialType: '铆钉', code: 'TC-0017', name: '双面铆钉8mm', unit: '个', category: '五金', subCategory: '常规五金', spec: '8mm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.12, price2: 0.18, price3: 0.22, remark: '', status: '有效', createdAt: '2024-07-10' },
  { id: 'mp_018', tab: '物料', materialType: '铆钉', code: 'TC-0018', name: '双面铆钉10mm', unit: '个', category: '五金', subCategory: '常规五金', spec: '10mm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.15, price2: 0.22, price3: 0.28, remark: '', status: '有效', createdAt: '2024-07-10' },

  // ---- 五金·磁扣 - 海之洋 ----
  { id: 'mp_015', tab: '物料', materialType: '磁扣', code: 'TC-0015', name: '磁扣圆形14mm', unit: '个', category: '五金', subCategory: '磁扣', spec: '14mm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.30, price2: 0.45, price3: 0.55, remark: '', status: '有效', createdAt: '2024-07-05' },
  { id: 'mp_016', tab: '物料', materialType: '磁扣', code: 'TC-0016', name: '磁扣圆形18mm', unit: '个', category: '五金', subCategory: '磁扣', spec: '18mm', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.38, price2: 0.55, price3: 0.68, remark: '', status: '有效', createdAt: '2024-07-05' },

  // ---- 五金·拉链 - 联创五金 ----
  { id: 'mp_019', tab: '物料', materialType: '拉链头', code: 'LCK-001', name: 'YKK金属拉链头3#', unit: '个', category: '五金', subCategory: '拉链', spec: '3#', brand: 'YKK', supplierId: 'ps_lckj', supplierName: '联创五金', price1: 1.20, price2: 1.60, price3: 1.85, remark: '', status: '有效', createdAt: '2024-05-20' },
  { id: 'mp_020', tab: '物料', materialType: '拉链头', code: 'LCK-002', name: 'YKK金属拉链头5#', unit: '个', category: '五金', subCategory: '拉链', spec: '5#', brand: 'YKK', supplierId: 'ps_lckj', supplierName: '联创五金', price1: 1.50, price2: 2.00, price3: 2.35, remark: '', status: '有效', createdAt: '2024-05-20' },
  { id: 'mp_021', tab: '物料', materialType: '拉链头', code: 'LCK-003', name: 'YKK金属拉链头8#', unit: '个', category: '五金', subCategory: '拉链', spec: '8#', brand: 'YKK', supplierId: 'ps_lckj', supplierName: '联创五金', price1: 1.80, price2: 2.40, price3: 2.85, remark: '', status: '有效', createdAt: '2024-05-22' },

  // ---- 五金·特殊五金 - 联创五金 ----
  { id: 'mp_022', tab: '物料', materialType: '箱包锁', code: 'LCK-004', name: '合金方形箱包锁', unit: '个', category: '五金', subCategory: '特殊五金', spec: '3.5*2.5cm', brand: '国标', supplierId: 'ps_lckj', supplierName: '联创五金', price1: 3.50, price2: 4.80, price3: 5.60, remark: '', status: '有效', createdAt: '2024-06-01' },
  { id: 'mp_023', tab: '物料', materialType: '箱包锁', code: 'LCK-005', name: '合金圆形转锁', unit: '个', category: '五金', subCategory: '特殊五金', spec: '直径3cm', brand: '国标', supplierId: 'ps_lckj', supplierName: '联创五金', price1: 2.80, price2: 3.90, price3: 4.50, remark: '', status: '有效', createdAt: '2024-06-01' },

  // ---- 五金·铁链 - 天成五金 ----
  { id: 'mp_024', tab: '物料', materialType: '链条', code: 'TCC-001', name: '铝链O字链6mm', unit: '米', category: '五金', subCategory: '铁链', spec: '6mm', brand: '国标', supplierId: 'ps_tcwj', supplierName: '天成五金', price1: 5.50, price2: 7.20, price3: 8.50, remark: '', status: '有效', createdAt: '2024-04-15' },
  { id: 'mp_025', tab: '物料', materialType: '链条', code: 'TCC-002', name: '铝链O字链8mm', unit: '米', category: '五金', subCategory: '铁链', spec: '8mm', brand: '国标', supplierId: 'ps_tcwj', supplierName: '天成五金', price1: 7.00, price2: 9.20, price3: 11.00, remark: '', status: '有效', createdAt: '2024-04-15' },
  { id: 'mp_026', tab: '物料', materialType: '链条', code: 'TCC-003', name: '蛇骨链4mm', unit: '米', category: '五金', subCategory: '铁链', spec: '4mm', brand: '国标', supplierId: 'ps_tcwj', supplierName: '天成五金', price1: 8.00, price2: 10.50, price3: 12.80, remark: '', status: '有效', createdAt: '2024-04-18' },

  // ---- 五金·常规五金 - 天成五金 ----
  { id: 'mp_027', tab: '物料', materialType: '日字扣', code: 'TCC-004', name: '日字扣2cm', unit: '个', category: '五金', subCategory: '常规五金', spec: '2cm', brand: '国标', supplierId: 'ps_tcwj', supplierName: '天成五金', price1: 0.28, price2: 0.40, price3: 0.50, remark: '', status: '有效', createdAt: '2024-05-01' },
  { id: 'mp_028', tab: '物料', materialType: '日字扣', code: 'TCC-005', name: '日字扣2.5cm', unit: '个', category: '五金', subCategory: '常规五金', spec: '2.5cm', brand: '国标', supplierId: 'ps_tcwj', supplierName: '天成五金', price1: 0.32, price2: 0.46, price3: 0.58, remark: '', status: '有效', createdAt: '2024-05-01' },

  // ---- 五金·常规五金 - 明辉五金 ----
  { id: 'mp_029', tab: '物料', materialType: '四合扣', code: 'MH-001', name: '四合扣12mm铜质', unit: '个', category: '五金', subCategory: '常规五金', spec: '12mm', brand: '国标', supplierId: 'ps_mhwj', supplierName: '明辉五金', price1: 0.18, price2: 0.28, price3: 0.35, remark: '', status: '有效', createdAt: '2024-03-20' },
  { id: 'mp_030', tab: '物料', materialType: '四合扣', code: 'MH-002', name: '四合扣15mm铜质', unit: '个', category: '五金', subCategory: '常规五金', spec: '15mm', brand: '国标', supplierId: 'ps_mhwj', supplierName: '明辉五金', price1: 0.22, price2: 0.32, price3: 0.42, remark: '', status: '有效', createdAt: '2024-03-20' },
  { id: 'mp_031', tab: '物料', materialType: '脚钉', code: 'MH-003', name: '底部脚钉圆形12mm', unit: '个', category: '五金', subCategory: '常规五金', spec: '12mm', brand: '国标', supplierId: 'ps_mhwj', supplierName: '明辉五金', price1: 0.25, price2: 0.38, price3: 0.48, remark: '', status: '有效', createdAt: '2024-04-10' },
  { id: 'mp_032', tab: '物料', materialType: '脚钉', code: 'MH-004', name: '底部脚钉圆形15mm', unit: '个', category: '五金', subCategory: '常规五金', spec: '15mm', brand: '国标', supplierId: 'ps_mhwj', supplierName: '明辉五金', price1: 0.30, price2: 0.45, price3: 0.55, remark: '', status: '有效', createdAt: '2024-04-10' },

  // ---- 面料 - 华信贸易 ----
  { id: 'mp_033', tab: '物料', materialType: '牛皮', code: 'HX-001', name: '头层牛皮荔枝纹', unit: '尺', category: '面料', spec: '1.0-1.2mm', brand: '无品牌', supplierId: 'ps_hxmy', supplierName: '华信贸易', price1: 12.50, price2: null, price3: null, remark: '按尺计价', status: '有效', createdAt: '2024-03-15' },
  { id: 'mp_034', tab: '物料', materialType: '牛皮', code: 'HX-002', name: '头层牛皮纳帕纹', unit: '尺', category: '面料', spec: '0.8-1.0mm', brand: '无品牌', supplierId: 'ps_hxmy', supplierName: '华信贸易', price1: 14.80, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-03-15' },
  { id: 'mp_035', tab: '物料', materialType: '牛皮', code: 'HX-003', name: '二层牛皮磨砂', unit: '尺', category: '面料', spec: '1.2-1.4mm', brand: '无品牌', supplierId: 'ps_hxmy', supplierName: '华信贸易', price1: 6.20, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-04-01' },

  // ---- 面料 - 永盛面料 ----
  { id: 'mp_036', tab: '物料', materialType: 'PU皮', code: 'YS-001', name: 'PU皮荔枝纹', unit: '码', category: '面料', spec: '0.8mm', brand: '东洋', supplierId: 'ps_ysml', supplierName: '永盛面料', price1: 18.00, price2: null, price3: null, remark: '幅宽54英寸', status: '有效', createdAt: '2024-01-25' },
  { id: 'mp_037', tab: '物料', materialType: 'PU皮', code: 'YS-002', name: 'PU皮十字纹', unit: '码', category: '面料', spec: '1.0mm', brand: '东洋', supplierId: 'ps_ysml', supplierName: '永盛面料', price1: 22.00, price2: null, price3: null, remark: '幅宽54英寸', status: '有效', createdAt: '2024-02-10' },
  { id: 'mp_038', tab: '物料', materialType: 'PU皮', code: 'YS-003', name: 'PU皮蛇纹', unit: '码', category: '面料', spec: '0.8mm', brand: '东洋', supplierId: 'ps_ysml', supplierName: '永盛面料', price1: 26.00, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-02-15' },

  // ---- 面布 - 锦绣纺织 ----
  { id: 'mp_039', tab: '物料', materialType: '里布', code: 'JX-001', name: '涤纶里布黑色', unit: '码', category: '面布', spec: '75D', brand: '无品牌', supplierId: 'ps_jxfz', supplierName: '锦绣纺织', price1: 5.50, price2: null, price3: null, remark: '幅宽58英寸', status: '有效', createdAt: '2024-04-18' },
  { id: 'mp_040', tab: '物料', materialType: '里布', code: 'JX-002', name: '涤纶里布红色', unit: '码', category: '面布', spec: '75D', brand: '无品牌', supplierId: 'ps_jxfz', supplierName: '锦绣纺织', price1: 5.80, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-04-18' },
  { id: 'mp_041', tab: '物料', materialType: '涤纶布', code: 'JX-003', name: '防水涤纶牛津布', unit: '码', category: '面布', spec: '600D', brand: '无品牌', supplierId: 'ps_jxfz', supplierName: '锦绣纺织', price1: 8.50, price2: null, price3: null, remark: '防水处理', status: '有效', createdAt: '2024-05-05' },

  // ---- 辅料 - 鸿达辅料 ----
  { id: 'mp_042', tab: '物料', materialType: '针线', code: 'HD-001', name: '尼龙缝纫线20/3', unit: '卷', category: '辅料', spec: '3000码/卷', brand: '无品牌', supplierId: 'ps_hdfl', supplierName: '鸿达辅料', price1: 8.00, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-06-05' },
  { id: 'mp_043', tab: '物料', materialType: '针线', code: 'HD-002', name: '尼龙缝纫线40/3', unit: '卷', category: '辅料', spec: '2000码/卷', brand: '无品牌', supplierId: 'ps_hdfl', supplierName: '鸿达辅料', price1: 12.00, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-06-05' },
  { id: 'mp_044', tab: '物料', materialType: '胶水', code: 'HD-003', name: '黄胶万能胶', unit: '桶', category: '辅料', spec: '15L', brand: '国标', supplierId: 'ps_hdfl', supplierName: '鸿达辅料', price1: 85.00, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-06-10' },
  { id: 'mp_045', tab: '物料', materialType: '拉链', code: 'HD-004', name: 'YKK尼龙拉链5#', unit: '条', category: '辅料', spec: '5#/30cm', brand: 'YKK', supplierId: 'ps_hdfl', supplierName: '鸿达辅料', price1: 2.50, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-06-12' },
  { id: 'mp_046', tab: '物料', materialType: '拉链', code: 'HD-005', name: 'YKK尼龙拉链5#', unit: '条', category: '辅料', spec: '5#/40cm', brand: 'YKK', supplierId: 'ps_hdfl', supplierName: '鸿达辅料', price1: 3.00, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-06-12' },

  // ---- 包装 - 顺达包装 ----
  { id: 'mp_047', tab: '物料', materialType: '纸盒', code: 'SD-001', name: '天地盒白卡纸', unit: '个', category: '包装', spec: '30*20*10cm', brand: '无品牌', supplierId: 'ps_sdbz', supplierName: '顺达包装', price1: 3.80, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-09-12' },
  { id: 'mp_048', tab: '物料', materialType: '纸盒', code: 'SD-002', name: '天地盒牛皮纸', unit: '个', category: '包装', spec: '25*18*8cm', brand: '无品牌', supplierId: 'ps_sdbz', supplierName: '顺达包装', price1: 2.80, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-09-12' },
  { id: 'mp_049', tab: '物料', materialType: '防尘袋', code: 'SD-003', name: '无纺布防尘袋', unit: '个', category: '包装', spec: '40*50cm', brand: '无品牌', supplierId: 'ps_sdbz', supplierName: '顺达包装', price1: 0.60, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-09-15' },
  { id: 'mp_050', tab: '物料', materialType: '防尘袋', code: 'SD-004', name: '绒布防尘袋', unit: '个', category: '包装', spec: '35*45cm', brand: '无品牌', supplierId: 'ps_sdbz', supplierName: '顺达包装', price1: 1.20, price2: null, price3: null, remark: '', status: '有效', createdAt: '2024-09-15' },

  // ---- 五金·常规五金 - 宏远塑胶（塑料五金） ----
  { id: 'mp_051', tab: '物料', materialType: '塑料扣', code: 'HY-001', name: '塑料日字扣2cm', unit: '个', category: '五金', subCategory: '常规五金', spec: '2cm', brand: '无品牌', supplierId: 'ps_hysj', supplierName: '宏远塑胶', price1: 0.08, price2: null, price3: 0.12, remark: '', status: '有效', createdAt: '2024-05-10' },
  { id: 'mp_052', tab: '物料', materialType: '塑料扣', code: 'HY-002', name: '塑料插扣2.5cm', unit: '个', category: '五金', subCategory: '常规五金', spec: '2.5cm', brand: '无品牌', supplierId: 'ps_hysj', supplierName: '宏远塑胶', price1: 0.15, price2: null, price3: 0.22, remark: '', status: '有效', createdAt: '2024-05-10' },

  // 停用的几条
  { id: 'mp_053', tab: '物料', materialType: 'TC嘴头', code: 'TC-0050', name: 'TC嘴头旧款方形', unit: '个', category: '五金', subCategory: '特殊五金', spec: '标准', brand: 'TC', supplierId: 'ps_hzy', supplierName: '海之洋', price1: 0.70, price2: 0.95, price3: 1.10, remark: '已停产', status: '无效', createdAt: '2023-12-01' },
  { id: 'mp_054', tab: '物料', materialType: '牛皮', code: 'HX-010', name: '头层牛皮光面（旧）', unit: '尺', category: '面料', spec: '1.0mm', brand: '无品牌', supplierId: 'ps_hxmy', supplierName: '华信贸易', price1: 11.00, price2: null, price3: null, remark: '已换新批次', status: '无效', createdAt: '2023-10-15' },
];

/* ============================================================
 * 工艺价格数据
 * ============================================================ */
export const MOCK_PROCESS_PRICES: PriceItem[] = [
  // ---- 印花 - 德力印花 ----
  { id: 'pp_001', tab: '工艺', materialType: '丝印', code: 'DL-001', name: '单色丝印LOGO', unit: '个', category: '印花', spec: '≤5cm', brand: '', supplierId: 'ps_dlyh', supplierName: '德力印花', price1: 0.30, price2: 0.50, price3: null, remark: '', status: '有效', createdAt: '2024-03-08' },
  { id: 'pp_002', tab: '工艺', materialType: '丝印', code: 'DL-002', name: '双色丝印LOGO', unit: '个', category: '印花', spec: '≤5cm', brand: '', supplierId: 'ps_dlyh', supplierName: '德力印花', price1: 0.50, price2: 0.80, price3: null, remark: '', status: '有效', createdAt: '2024-03-08' },
  { id: 'pp_003', tab: '工艺', materialType: '热转印', code: 'DL-003', name: '热转印满版花型', unit: '尺', category: '印花', spec: '不限', brand: '', supplierId: 'ps_dlyh', supplierName: '德力印花', price1: 2.00, price2: 3.00, price3: null, remark: '含制版费', status: '有效', createdAt: '2024-03-10' },

  // ---- 缝纫 - 精工缝纫 ----
  { id: 'pp_004', tab: '工艺', materialType: '车缝', code: 'JG-001', name: '车缝内衬', unit: '个', category: '缝纫', spec: '标准', brand: '', supplierId: 'ps_jgfr', supplierName: '精工缝纫', price1: 3.00, price2: 4.50, price3: null, remark: '', status: '有效', createdAt: '2024-05-12' },
  { id: 'pp_005', tab: '工艺', materialType: '车缝', code: 'JG-002', name: '车缝肩带', unit: '条', category: '缝纫', spec: '标准', brand: '', supplierId: 'ps_jgfr', supplierName: '精工缝纫', price1: 1.50, price2: 2.20, price3: null, remark: '', status: '有效', createdAt: '2024-05-12' },
  { id: 'pp_006', tab: '工艺', materialType: '包边', code: 'JG-003', name: '包边处理-直线', unit: '米', category: '缝纫', spec: '标准', brand: '', supplierId: 'ps_jgfr', supplierName: '精工缝纫', price1: 0.80, price2: 1.20, price3: null, remark: '', status: '有效', createdAt: '2024-05-15' },

  // ---- 电镀 - 恒通电镀 ----
  { id: 'pp_007', tab: '工艺', materialType: '电镀', code: 'HT-001', name: '电镀浅金色', unit: '个', category: '电镀', spec: '≤3cm', brand: '', supplierId: 'ps_htdd', supplierName: '恒通电镀', price1: 0.25, price2: 0.40, price3: 0.30, remark: '不含底材', status: '有效', createdAt: '2024-04-02' },
  { id: 'pp_008', tab: '工艺', materialType: '电镀', code: 'HT-002', name: '电镀枪色', unit: '个', category: '电镀', spec: '≤3cm', brand: '', supplierId: 'ps_htdd', supplierName: '恒通电镀', price1: 0.28, price2: 0.45, price3: 0.35, remark: '', status: '有效', createdAt: '2024-04-02' },
  { id: 'pp_009', tab: '工艺', materialType: '电镀', code: 'HT-003', name: '电镀银色', unit: '个', category: '电镀', spec: '≤3cm', brand: '', supplierId: 'ps_htdd', supplierName: '恒通电镀', price1: 0.22, price2: 0.35, price3: 0.28, remark: '', status: '有效', createdAt: '2024-04-05' },

  // ---- 油边 - 振华皮艺 ----
  { id: 'pp_010', tab: '工艺', materialType: '油边', code: 'ZH-001', name: '手工油边-单边', unit: '米', category: '油边', spec: '标准', brand: '', supplierId: 'ps_zhpy', supplierName: '振华皮艺', price1: 1.00, price2: 1.50, price3: null, remark: '', status: '有效', createdAt: '2024-06-01' },
  { id: 'pp_011', tab: '工艺', materialType: '油边', code: 'ZH-002', name: '机器油边-单边', unit: '米', category: '油边', spec: '标准', brand: '', supplierId: 'ps_zhpy', supplierName: '振华皮艺', price1: 0.50, price2: 0.80, price3: null, remark: '', status: '有效', createdAt: '2024-06-01' },

  // ---- 绣花 - 锦美绣花 ----
  { id: 'pp_012', tab: '工艺', materialType: '绣花', code: 'JM-001', name: '电脑绣花LOGO小', unit: '个', category: '绣花', spec: '≤3cm', brand: '', supplierId: 'ps_jmxh', supplierName: '锦美绣花', price1: 0.60, price2: 1.00, price3: null, remark: '', status: '有效', createdAt: '2024-07-01' },
  { id: 'pp_013', tab: '工艺', materialType: '绣花', code: 'JM-002', name: '电脑绣花LOGO中', unit: '个', category: '绣花', spec: '3-6cm', brand: '', supplierId: 'ps_jmxh', supplierName: '锦美绣花', price1: 1.20, price2: 1.80, price3: null, remark: '', status: '有效', createdAt: '2024-07-01' },
  { id: 'pp_014', tab: '工艺', materialType: '绣花', code: 'JM-003', name: '电脑绣花满版', unit: '尺', category: '绣花', spec: '不限', brand: '', supplierId: 'ps_jmxh', supplierName: '锦美绣花', price1: 5.00, price2: 7.50, price3: null, remark: '含换色', status: '有效', createdAt: '2024-07-05' },

  // ---- 压唛 - 宏益压唛 ----
  { id: 'pp_015', tab: '工艺', materialType: '压唛', code: 'HYM-001', name: '皮标压唛-平压', unit: '个', category: '压唛', spec: '≤4cm', brand: '', supplierId: 'ps_hyym', supplierName: '宏益压唛', price1: 0.35, price2: 0.55, price3: null, remark: '', status: '有效', createdAt: '2024-08-01' },
  { id: 'pp_016', tab: '工艺', materialType: '压唛', code: 'HYM-002', name: '皮标压唛-凹凸', unit: '个', category: '压唛', spec: '≤4cm', brand: '', supplierId: 'ps_hyym', supplierName: '宏益压唛', price1: 0.50, price2: 0.80, price3: null, remark: '', status: '有效', createdAt: '2024-08-01' },
  { id: 'pp_017', tab: '工艺', materialType: '压花', code: 'HYM-003', name: '皮面压花-整张', unit: '尺', category: '压花', spec: '不限', brand: '', supplierId: 'ps_hyym', supplierName: '宏益压唛', price1: 2.00, price2: 3.00, price3: null, remark: '含模具对位', status: '有效', createdAt: '2024-08-05' },
];

export const ALL_MOCK_PRICES: PriceItem[] = [...MOCK_MATERIAL_PRICES, ...MOCK_PROCESS_PRICES];
