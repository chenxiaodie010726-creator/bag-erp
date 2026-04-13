/* ============================================================
 * 供应商管理模拟数据
 * 文件位置: src/app/(dashboard)/suppliers/_components/mockData.ts
 * ============================================================ */

export type SupplierType = '物料供应商' | '工艺供应商';

/** 物料类供应商分类（面料、五金等） */
export type MaterialSupplierCategory =
  | '面料'
  | '里布'
  | '辅料'
  | '五金'
  | '包装'
  | '机械设备'
  | '电子元件'
  | '其他';

/** 工艺类供应商分类（加工工序），与物料分类独立 */
export type ProcessSupplierCategory =
  | '压花'
  | '压唛'
  | '油边'
  | '绣花'
  | '印花'
  | '缝纫'
  | '电镀'
  | '其他';

export type SupplierCategory = MaterialSupplierCategory | ProcessSupplierCategory;

export type SupplierStatus = '启用' | '停用';

/** 账期单位（代码侧）；展示为「天」「个月」 */
export type PaymentTermUnitCode = 'day' | 'month';

/**
 * 从「45 天」「3 个月」「45天」等文本解析账期。
 * 无法识别时默认 30 天（用于表单回显）。
 */
export function parsePaymentTerm(raw: string): { amount: number; unit: PaymentTermUnitCode } {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { amount: 30, unit: 'day' };

  const monthMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:个)?月/);
  if (monthMatch) {
    const amount = parseFloat(monthMatch[1]);
    return { amount: Number.isFinite(amount) && amount > 0 ? amount : 1, unit: 'month' };
  }
  const dayMatch = s.match(/^(\d+(?:\.\d+)?)\s*天/);
  if (dayMatch) {
    const amount = parseFloat(dayMatch[1]);
    return { amount: Number.isFinite(amount) && amount > 0 ? amount : 30, unit: 'day' };
  }
  const numOnly = s.match(/^(\d+(?:\.\d+)?)$/);
  if (numOnly) {
    const amount = parseFloat(numOnly[1]);
    return { amount: Number.isFinite(amount) && amount > 0 ? amount : 30, unit: 'day' };
  }
  return { amount: 30, unit: 'day' };
}

/** 规范展示：如「45 天」「3 个月」 */
export function formatPaymentTerm(amount: number, unit: PaymentTermUnitCode): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '0 天';
  const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return unit === 'day' ? `${rounded} 天` : `${rounded} 个月`;
}

/**
 * 导入/粘贴等自由文本：能识别则规范化，否则保留原文。
 */
export function normalizePaymentTerm(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '30 天';
  const monthOk = /^(\d+(?:\.\d+)?)\s*(?:个)?月/.test(s);
  const dayOk = /^(\d+(?:\.\d+)?)\s*天/.test(s);
  const numOnly = /^(\d+(?:\.\d+)?)$/.test(s);
  if (monthOk || dayOk || numOnly) {
    const p = parsePaymentTerm(s);
    return formatPaymentTerm(p.amount, p.unit);
  }
  return s;
}

export interface SupplierItem {
  id: string;
  name: string;
  fullName: string;
  type: SupplierType;
  category: SupplierCategory;
  /** 展示用字符串，如「45 天」「3 个月」 */
  paymentTerm: string;
  wechatBound: boolean;
  contactGroup: string;
  groupMembers: number;
  wechatId: string;
  hasLicense: boolean;
  status: SupplierStatus;
  createdAt: string;
}

/** 物料供应商默认分类（顺序即快捷筛选顺序） */
export const SUPPLIER_CATEGORIES_MATERIAL: MaterialSupplierCategory[] = [
  '面料', '里布', '辅料', '五金', '包装', '机械设备', '电子元件', '其他',
];

/** 工艺供应商默认分类 */
export const SUPPLIER_CATEGORIES_PROCESS: ProcessSupplierCategory[] = [
  '压花', '压唛', '油边', '绣花', '印花', '缝纫', '电镀', '其他',
];

/** @deprecated 请使用 SUPPLIER_CATEGORIES_MATERIAL */
export const SUPPLIER_CATEGORIES = SUPPLIER_CATEGORIES_MATERIAL;

/**
 * 导入行：按供应商类型校验分类，不在列表则归为对应类型的「其他」。
 */
export function resolveImportedCategory(
  raw: string,
  type: SupplierType,
  materialList: readonly string[],
  processList: readonly string[],
): SupplierCategory {
  const t = String(raw ?? '').trim();
  const list = type === '工艺供应商' ? processList : materialList;
  if (t && list.includes(t)) return t as SupplierCategory;
  if (list.includes('其他')) return '其他';
  return (list[0] ?? '其他') as SupplierCategory;
}

export const CATEGORY_COLORS: Record<SupplierCategory, { bg: string; text: string }> = {
  /* —— 物料 —— */
  '面料': { bg: 'bg-blue-100', text: 'text-blue-700' },
  '里布': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  '辅料': { bg: 'bg-pink-100', text: 'text-pink-700' },
  '五金': { bg: 'bg-purple-100', text: 'text-purple-700' },
  '包装': { bg: 'bg-amber-100', text: 'text-amber-700' },
  '机械设备': { bg: 'bg-gray-100', text: 'text-gray-700' },
  '电子元件': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  /* —— 工艺 —— */
  '压花': { bg: 'bg-rose-100', text: 'text-rose-700' },
  '压唛': { bg: 'bg-amber-100', text: 'text-amber-800' },
  '油边': { bg: 'bg-orange-100', text: 'text-orange-800' },
  '绣花': { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  '印花': { bg: 'bg-violet-100', text: 'text-violet-700' },
  '缝纫': { bg: 'bg-sky-100', text: 'text-sky-800' },
  '电镀': { bg: 'bg-zinc-200', text: 'text-zinc-800' },
  /* 物料/工艺共用「其他」 */
  '其他': { bg: 'bg-slate-100', text: 'text-slate-600' },
};

export const MOCK_SUPPLIERS: SupplierItem[] = [
  {
    id: 'sup_001',
    name: '华信贸易',
    fullName: '深圳市华信贸易有限公司',
    type: '物料供应商',
    category: '面料',
    paymentTerm: '45 天',
    wechatBound: true,
    contactGroup: '华信贸易采购群',
    groupMembers: 35,
    wechatId: 'wx_huaxin2024',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-03-15',
  },
  {
    id: 'sup_002',
    name: '联创科技',
    fullName: '广州联创科技有限公司',
    type: '物料供应商',
    category: '五金',
    paymentTerm: '2 个月',
    wechatBound: true,
    contactGroup: '联创科技合作群',
    groupMembers: 28,
    wechatId: 'lckj_001',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-05-20',
  },
  {
    id: 'sup_003',
    name: '旭日电子',
    fullName: '东莞市旭日电子有限公司',
    type: '物料供应商',
    category: '电子元件',
    paymentTerm: '60 天',
    wechatBound: true,
    contactGroup: '旭日电子供应链群',
    groupMembers: 18,
    wechatId: 'xuridianzi',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-01-10',
  },
  {
    id: 'sup_004',
    name: '宏远塑胶',
    fullName: '佛山市宏远塑胶制品有限公司',
    type: '物料供应商',
    category: '辅料',
    paymentTerm: '2 个月',
    wechatBound: true,
    contactGroup: '宏远塑胶合作群',
    groupMembers: 42,
    wechatId: 'hy_sujiao',
    hasLicense: true,
    status: '启用',
    createdAt: '2023-11-08',
  },
  {
    id: 'sup_005',
    name: '天成五金',
    fullName: '中山市天成五金制品有限公司',
    type: '物料供应商',
    category: '五金',
    paymentTerm: '30 天',
    wechatBound: true,
    contactGroup: '天成五金供应商群',
    groupMembers: 26,
    wechatId: 'tcwj88',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-07-03',
  },
  {
    id: 'sup_hzy',
    name: '海之洋',
    fullName: '海之洋五金（示例）',
    type: '物料供应商',
    category: '五金',
    paymentTerm: '30 天',
    wechatBound: false,
    contactGroup: '',
    groupMembers: 0,
    wechatId: '',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-06-01',
  },
  {
    id: 'sup_006',
    name: '顺达包装',
    fullName: '上海顺达包装材料有限公司',
    type: '物料供应商',
    category: '包装',
    paymentTerm: '90 天',
    wechatBound: false,
    contactGroup: '',
    groupMembers: 0,
    wechatId: '',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-09-12',
  },
  {
    id: 'sup_007',
    name: '兴业机械',
    fullName: '苏州市兴业机械设备有限公司',
    type: '物料供应商',
    category: '机械设备',
    paymentTerm: '3 个月',
    wechatBound: false,
    contactGroup: '',
    groupMembers: 0,
    wechatId: '',
    hasLicense: true,
    status: '停用',
    createdAt: '2024-02-28',
  },
  {
    id: 'sup_008',
    name: '锦绣纺织',
    fullName: '杭州锦绣纺织有限公司',
    type: '物料供应商',
    category: '里布',
    paymentTerm: '45 天',
    wechatBound: true,
    contactGroup: '锦绣纺织业务群',
    groupMembers: 31,
    wechatId: 'jx_textile',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-04-18',
  },
  {
    id: 'sup_009',
    name: '鸿达辅料',
    fullName: '东莞市鸿达辅料有限公司',
    type: '物料供应商',
    category: '辅料',
    paymentTerm: '30 天',
    wechatBound: true,
    contactGroup: '鸿达辅料合作群',
    groupMembers: 22,
    wechatId: 'hd_fuliao',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-06-05',
  },
  {
    id: 'sup_010',
    name: '明辉五金',
    fullName: '佛山市明辉五金制品有限公司',
    type: '物料供应商',
    category: '五金',
    paymentTerm: '60 天',
    wechatBound: true,
    contactGroup: '明辉五金供货群',
    groupMembers: 19,
    wechatId: 'mh_wujin',
    hasLicense: true,
    status: '启用',
    createdAt: '2023-12-20',
  },
  {
    id: 'sup_011',
    name: '永盛面料',
    fullName: '绍兴永盛面料有限公司',
    type: '物料供应商',
    category: '面料',
    paymentTerm: '2 个月',
    wechatBound: true,
    contactGroup: '永盛面料商务群',
    groupMembers: 38,
    wechatId: 'ys_mianliao',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-01-25',
  },
  {
    id: 'sup_012',
    name: '瑞丰包装',
    fullName: '广州瑞丰包装科技有限公司',
    type: '物料供应商',
    category: '包装',
    paymentTerm: '45 天',
    wechatBound: false,
    contactGroup: '',
    groupMembers: 0,
    wechatId: '',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-08-14',
  },
  {
    id: 'sup_013',
    name: '德力印花',
    fullName: '佛山市德力印花工艺有限公司',
    type: '工艺供应商',
    category: '印花',
    paymentTerm: '30 天',
    wechatBound: true,
    contactGroup: '德力印花合作群',
    groupMembers: 15,
    wechatId: 'dl_yinhua',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-03-08',
  },
  {
    id: 'sup_014',
    name: '精工缝纫',
    fullName: '东莞精工缝纫加工厂',
    type: '工艺供应商',
    category: '缝纫',
    paymentTerm: '45 天',
    wechatBound: true,
    contactGroup: '精工缝纫业务群',
    groupMembers: 20,
    wechatId: 'jg_fengren',
    hasLicense: false,
    status: '启用',
    createdAt: '2024-05-12',
  },
  {
    id: 'sup_015',
    name: '恒通电镀',
    fullName: '深圳恒通电镀工艺有限公司',
    type: '工艺供应商',
    category: '电镀',
    paymentTerm: '60 天',
    wechatBound: true,
    contactGroup: '恒通电镀合作群',
    groupMembers: 12,
    wechatId: 'ht_diandu',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-04-02',
  },
  {
    id: 'sup_016',
    name: '振华皮艺',
    fullName: '广州振华皮艺加工有限公司',
    type: '工艺供应商',
    category: '油边',
    paymentTerm: '2 个月',
    wechatBound: false,
    contactGroup: '',
    groupMembers: 0,
    wechatId: '',
    hasLicense: true,
    status: '停用',
    createdAt: '2023-10-15',
  },
  {
    id: 'sup_017',
    name: '国泰面料',
    fullName: '南通国泰面料有限公司',
    type: '物料供应商',
    category: '面料',
    paymentTerm: '30 天',
    wechatBound: true,
    contactGroup: '国泰面料采购群',
    groupMembers: 29,
    wechatId: 'gt_mianliao',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-02-10',
  },
  {
    id: 'sup_018',
    name: '新达电子',
    fullName: '深圳新达电子科技有限公司',
    type: '物料供应商',
    category: '电子元件',
    paymentTerm: '45 天',
    wechatBound: true,
    contactGroup: '新达电子供应群',
    groupMembers: 16,
    wechatId: 'xd_dianzi',
    hasLicense: true,
    status: '启用',
    createdAt: '2024-07-22',
  },
];
