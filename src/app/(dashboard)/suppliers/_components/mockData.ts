/* ============================================================
 * 供应商管理模拟数据
 * 文件位置: src/app/(dashboard)/suppliers/_components/mockData.ts
 * ============================================================ */

export type SupplierType = '物料供应商' | '工艺供应商';

/** 物料类供应商分类（面料、五金等） */
export type MaterialSupplierCategory =
  | '面料'
  | '面布'
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
  '面料', '面布', '辅料', '五金', '包装', '机械设备', '电子元件', '其他',
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
  '面布': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
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

export const MOCK_SUPPLIERS: SupplierItem[] = [];
