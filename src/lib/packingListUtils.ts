/* ============================================================
 * 装箱单工具函数
 * 负责装箱单的计算逻辑、本地存储读写、Excel导出
 * ============================================================ */

import { STORAGE_KEYS } from './storageKeys';

// ---------- 类型（与 types/index.ts 一致，此处只做本地引用） ----------

export interface PackingListItem {
  id: string;
  packing_list_id: string;
  sku: string;
  /** 从 PO 导入时的原始 SKU，非空则 SKU/单价需通过「修改默认值」编辑 */
  ref_sku_from_po: string | null;
  /** 从订单明细带入的原始单价 */
  ref_unit_price_from_po: number | null;
  carton_qty: number;
  pcs_per_carton: number;
  unit_price: number;
  gross_weight_per_carton: number;
  product_weight: number;
  carton_size: string;
  outer_carton_size: string | null;
  mixed_group: string | null;
  sort_order: number;
  notes: string | null;
}

/** 修改 SKU/单价默认值 的记录 */
export interface PackingListDefaultChangeEntry {
  id: string;
  at: string;
  operator: string;
  item_id: string;
  message: string;
}

export interface PackingListData {
  id: string;
  packing_list_no: string;
  po_number: string;
  /** 客户出库号（inbound#） */
  shipment_number: string | null;
  shipment_date: string | null;
  status: 'draft' | 'confirmed' | 'applied';
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: PackingListItem[];
  /** 修改 PO 导入的 SKU / 单价 的记录 */
  default_change_log: PackingListDefaultChangeEntry[];
}

function normalizePackingItemRaw(raw: unknown): PackingListItem {
  const it = raw as Record<string, unknown>;
  const refSku = it.ref_sku_from_po;
  const refPrice = it.ref_unit_price_from_po;
  return {
    ...it,
    ref_sku_from_po: refSku === undefined || refSku === '' ? null : (refSku as string),
    ref_unit_price_from_po:
      refPrice === undefined || refPrice === null
        ? null
        : (() => {
            const n = Number(refPrice);
            return Number.isFinite(n) ? n : null;
          })(),
  } as PackingListItem;
}

/** 兼容旧数据：曾单独存 inbound_no，合并进 shipment_number；补齐明细字段 */
function normalizePackingListRaw(raw: unknown): PackingListData {
  const r = raw as Record<string, unknown>;
  let shipment_number = (r.shipment_number as string | null | undefined) ?? null;
  const inbound = r.inbound_no as string | null | undefined;
  if ((!shipment_number || String(shipment_number).trim() === '') && inbound && String(inbound).trim() !== '') {
    shipment_number = String(inbound).trim();
  }
  const rest = { ...r };
  delete rest.inbound_no;
  const rawItems = r.items;
  const items = Array.isArray(rawItems)
    ? rawItems.map((row) => normalizePackingItemRaw(row))
    : [];
  const logRaw = r.default_change_log;
  const default_change_log = Array.isArray(logRaw) ? (logRaw as PackingListDefaultChangeEntry[]) : [];
  return { ...rest, shipment_number, items, default_change_log } as PackingListData;
}

// ---------- 计算函数 ----------

/** 解析纸箱尺寸字符串（如 "55*48*40"），返回长宽高(cm) */
export function parseCartonSize(sizeStr: string): { l: number; w: number; h: number } | null {
  if (!sizeStr) return null;
  const parts = sizeStr.split(/[*×xX]/).map((s) => parseFloat(s.trim()));
  if (parts.length !== 3 || parts.some((v) => isNaN(v) || v <= 0)) return null;
  return { l: parts[0], w: parts[1], h: parts[2] };
}

/** 计算单箱CBM（立方米） */
export function calcCbmPerCarton(sizeStr: string): number {
  const dim = parseCartonSize(sizeStr);
  if (!dim) return 0;
  return (dim.l * dim.w * dim.h) / 1_000_000; // cm³ → m³
}

/** 计算单行总数量 */
export function calcRowTotalPcs(item: PackingListItem): number {
  return item.carton_qty * item.pcs_per_carton;
}

/**
 * 混装组内非首行 carton_qty 为 0 时，本行件数取 pcs_per_carton（与业务约定一致）
 */
export function calcRowEffectivePcs(item: PackingListItem): number {
  if (item.mixed_group && item.carton_qty === 0) {
    return Math.max(0, item.pcs_per_carton);
  }
  return calcRowTotalPcs(item);
}

/** 计算单行总金额 */
export function calcRowTotalAmount(item: PackingListItem): number {
  return calcRowEffectivePcs(item) * item.unit_price;
}

/** 计算单行总重量(kg) */
export function calcRowTotalWeight(item: PackingListItem): number {
  return item.gross_weight_per_carton * item.carton_qty;
}

/** 计算单行总CBM */
export function calcRowTotalCbm(item: PackingListItem): number {
  return calcCbmPerCarton(item.carton_size) * item.carton_qty;
}

/** 计算整单汇总 */
export function calcPackingListSummary(items: PackingListItem[]) {
  // 混装箱：同一 mixed_group 只算一次箱数
  const mixedGroups = new Set<string>();
  let totalCartons = 0;
  let totalPcs = 0;
  let totalWeight = 0;
  let totalCbm = 0;
  let totalAmount = 0;

  for (const item of items) {
    totalPcs += calcRowEffectivePcs(item);
    totalAmount += calcRowTotalAmount(item);

    if (item.mixed_group) {
      if (!mixedGroups.has(item.mixed_group)) {
        mixedGroups.add(item.mixed_group);
        // 混装组只在第一行计算箱数、重量、CBM
        totalCartons += item.carton_qty || 1;
        totalWeight += item.gross_weight_per_carton;
        totalCbm += calcCbmPerCarton(item.carton_size);
      }
      // 混装组的非首行：只累加数量和金额（已在上面累加），不累加箱/重量/CBM
    } else {
      totalCartons += item.carton_qty;
      totalWeight += calcRowTotalWeight(item);
      totalCbm += calcRowTotalCbm(item);
    }
  }

  return { totalCartons, totalPcs, totalWeight, totalCbm, totalAmount };
}

// ---------- 测试用默认装箱单（localStorage 为空时展示） ----------

/** 装箱单数据全部由用户在装箱单管理页创建，初始为空 */
const MOCK_PACKING_LISTS: PackingListData[] = [];

// ---------- 本地存储 ----------

export function loadPackingLists(): PackingListData[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PACKING_LISTS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.map((row) => normalizePackingListRaw(row));
    }
  } catch { /* ignore */ }
  return MOCK_PACKING_LISTS;
}

export function savePackingLists(data: PackingListData[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.PACKING_LISTS, JSON.stringify(data));
  } catch { /* quota */ }
}

/** 生成装箱单号 */
export function generatePackingListNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `PL${yy}${mm}${dd}-${seq}`;
}

/** 生成唯一ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 将日期输入值转为库存页使用的 yyyy/MM/dd（与 buildShipmentKey 一致） */
export function toInventoryDateFormat(isoOrSlash: string | null | undefined): string {
  const d = (isoOrSlash ?? '').trim();
  if (!d) {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const day = String(t.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${y}/${m}/${day}`;
  }
  return d.replace(/-/g, '/');
}
