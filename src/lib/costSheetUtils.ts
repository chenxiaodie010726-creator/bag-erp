/* ============================================================
 * 成本核算表工具函数
 * 计算逻辑、本地存储读写
 * ============================================================ */

import { STORAGE_KEYS } from './storageKeys';
import type {
  CostSheet,
  CostSheetMaterialItem,
  CostSheetHardwareItem,
  CostSheetPackagingItem,
  CostSheetCraftItem,
  CostSheetOilEdge,
  LaborCostSetting,
} from '@/types';

// ---------- 主料系列变体（常规 vs 特殊颜色系列）----------

/** 可按系列独立覆盖的物料字段（与成本明细可编辑列一致） */
export const MATERIAL_VARIANT_OVERRIDE_KEYS: (keyof CostSheetMaterialItem)[] = [
  'part_name',
  'length',
  'width',
  'pieces',
  'fabric_width',
  'waste_rate',
  'material_code',
  'unit_price',
  'oil_edge_inches',
  'glue_price',
  'remarks',
];

function materialFieldEqual(
  a: CostSheetMaterialItem[keyof CostSheetMaterialItem],
  b: CostSheetMaterialItem[keyof CostSheetMaterialItem],
): boolean {
  return a === b;
}

/** 合并单行：常规基准 + 某系列的覆盖 */
export function mergeMaterialItemWithVariant(
  base: CostSheetMaterialItem,
  variantKey: string,
  sheet: CostSheet,
): CostSheetMaterialItem {
  if (variantKey === '__standard__') return { ...base };
  const partial = sheet.material_variant_overrides?.[variantKey]?.[base.id];
  return partial ? { ...base, ...partial } : { ...base };
}

/** 当前系列下的物料明细（展示/计算用）
 *  优先使用 material_variant_full（做法不同的完整行集），其次是 material_variant_overrides（价格微调）。
 */
export function getMaterialItemsForVariant(sheet: CostSheet, variantKey: string): CostSheetMaterialItem[] {
  if (variantKey !== '__standard__') {
    const full = sheet.material_variant_full?.[variantKey];
    if (full && full.length > 0) return full;
  }
  return (sheet.material_items ?? []).map((b) => mergeMaterialItemWithVariant(b, variantKey, sheet));
}

/** 用于汇总：整张表 material_items 替换为某系列合并结果 */
export function getCostSheetForVariantTotals(sheet: CostSheet, variantKey: string): CostSheet {
  return { ...sheet, material_items: getMaterialItemsForVariant(sheet, variantKey) };
}

/** 常规基准行被改后，去掉各系列里与基准相同的冗余覆盖字段 */
export function pruneMaterialVariantOverrides(sheet: CostSheet): CostSheet {
  const bases = sheet.material_items ?? [];
  const ovRoot = sheet.material_variant_overrides;
  if (!ovRoot || Object.keys(ovRoot).length === 0) return sheet;

  const nextRoot: Record<string, Record<string, Partial<CostSheetMaterialItem>>> = {};
  for (const [vk, rows] of Object.entries(ovRoot)) {
    if (vk === '__standard__') continue;
    const nextRows: Record<string, Partial<CostSheetMaterialItem>> = {};
    for (const b of bases) {
      const p = rows[b.id];
      if (!p) continue;
      const trimmed: Partial<CostSheetMaterialItem> = { ...p };
      for (const f of MATERIAL_VARIANT_OVERRIDE_KEYS) {
        if (f in trimmed && materialFieldEqual(trimmed[f] as never, b[f] as never)) {
          delete trimmed[f];
        }
      }
      if (Object.keys(trimmed).length > 0) nextRows[b.id] = trimmed;
    }
    if (Object.keys(nextRows).length > 0) nextRoot[vk] = nextRows;
  }
  return {
    ...sheet,
    material_variant_overrides: Object.keys(nextRoot).length > 0 ? nextRoot : undefined,
  };
}

/** 删除一行物料时，同步删除各系列上对该 id 的覆盖 */
export function stripMaterialIdFromVariantOverrides(
  sheet: CostSheet,
  materialId: string,
): CostSheet {
  const ovRoot = sheet.material_variant_overrides;
  if (!ovRoot) return sheet;
  const nextRoot: Record<string, Record<string, Partial<CostSheetMaterialItem>>> = {};
  for (const [vk, rows] of Object.entries(ovRoot)) {
    if (vk === '__standard__') continue;
    const copy = { ...rows };
    delete copy[materialId];
    if (Object.keys(copy).length > 0) nextRoot[vk] = copy;
  }
  return {
    ...sheet,
    material_variant_overrides: Object.keys(nextRoot).length > 0 ? nextRoot : undefined,
  };
}

/** 编辑物料单元格：常规改 material_items；非常规系列只改对应覆盖，与基准相同则删覆盖字段 */
export function updateMaterialFieldForVariant(
  sheet: CostSheet,
  variantKey: string,
  materialId: string,
  field: keyof CostSheetMaterialItem,
  value: string | number | null,
): CostSheet {
  const list = sheet.material_items ?? [];
  const base = list.find((m) => m.id === materialId);
  if (!base) return sheet;

  if (variantKey !== '__standard__' && !MATERIAL_VARIANT_OVERRIDE_KEYS.includes(field)) {
    return sheet;
  }

  if (variantKey === '__standard__') {
    const nextSheet: CostSheet = {
      ...sheet,
      material_items: list.map((i) => (i.id === materialId ? { ...i, [field]: value } : i)),
    };
    return pruneMaterialVariantOverrides(nextSheet);
  }

  const overrides = { ...(sheet.material_variant_overrides ?? {}) };
  const row = { ...(overrides[variantKey] ?? {}) };
  const curPartial = { ...(row[materialId] ?? {}) };
  const nextPartial: Partial<CostSheetMaterialItem> = { ...curPartial, [field]: value };

  if (MATERIAL_VARIANT_OVERRIDE_KEYS.includes(field) && materialFieldEqual(nextPartial[field] as never, base[field] as never)) {
    delete nextPartial[field];
  }

  if (Object.keys(nextPartial).length === 0) {
    delete row[materialId];
  } else {
    row[materialId] = nextPartial;
  }

  if (Object.keys(row).length === 0) delete overrides[variantKey];
  else overrides[variantKey] = row;

  return {
    ...sheet,
    material_variant_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
}

/** 统一损耗：常规改基准行；非常规只改当前系列的覆盖 */
export function applyWasteRateForVariant(sheet: CostSheet, variantKey: string, rate: number): CostSheet {
  if (variantKey === '__standard__') {
    return pruneMaterialVariantOverrides({
      ...sheet,
      material_items: (sheet.material_items ?? []).map((i) => ({ ...i, waste_rate: rate })),
    });
  }

  const overrides = { ...(sheet.material_variant_overrides ?? {}) };
  const row: Record<string, Partial<CostSheetMaterialItem>> = { ...(overrides[variantKey] ?? {}) };

  for (const b of sheet.material_items ?? []) {
    const curPartial = { ...(row[b.id] ?? {}) };
    const nextPartial: Partial<CostSheetMaterialItem> = { ...curPartial, waste_rate: rate };
    if (materialFieldEqual(rate, b.waste_rate)) {
      delete nextPartial.waste_rate;
    }
    if (Object.keys(nextPartial).length === 0) {
      delete row[b.id];
    } else {
      row[b.id] = nextPartial;
    }
  }

  if (Object.keys(row).length === 0) delete overrides[variantKey];
  else overrides[variantKey] = row;

  return {
    ...sheet,
    material_variant_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
}

/**
 * 全局同步：把当前界面上的「源系列合并结果」写入所选目标系列。
 * - 目标为「常规」：直接改写 material_items 对应字段，并 prune 冗余覆盖。
 * - 目标为非常规系列：覆盖值 = 源合并行与 baseSnapshot 基准行的差分（避免多目标顺序互相干扰）。
 */
export function applyMaterialVariantGlobalSync(
  draft: CostSheet,
  options: {
    /** 打开同步对话框时深拷贝的 material_items，仅用于非常规目标的差分基准 */
    baseSnapshot: CostSheetMaterialItem[];
    sourceMerged: CostSheetMaterialItem[];
    targetKeys: string[];
  },
): CostSheet {
  const { baseSnapshot, sourceMerged, targetKeys } = options;
  if (targetKeys.length === 0) return draft;

  const srcById = new Map(sourceMerged.map((i) => [i.id, i]));
  let next: CostSheet = { ...draft };

  for (const targetKey of targetKeys) {
    if (targetKey === '__standard__') {
      next = {
        ...next,
        material_items: (next.material_items ?? []).map((b) => {
          const s = srcById.get(b.id);
          if (!s) return b;
          const partial: Record<string, unknown> = {};
          for (const f of MATERIAL_VARIANT_OVERRIDE_KEYS) {
            partial[f as string] = s[f];
          }
          return { ...b, ...(partial as Partial<CostSheetMaterialItem>) };
        }),
      };
      next = pruneMaterialVariantOverrides(next);
      continue;
    }

    const overrides = { ...(next.material_variant_overrides ?? {}) };
    const row: Record<string, Partial<CostSheetMaterialItem>> = {};

    for (const b of baseSnapshot) {
      const s = srcById.get(b.id);
      if (!s) continue;
      const diff: Record<string, unknown> = {};
      for (const f of MATERIAL_VARIANT_OVERRIDE_KEYS) {
        if (!materialFieldEqual(s[f] as never, b[f] as never)) {
          diff[f as string] = s[f];
        }
      }
      const diffTyped = diff as Partial<CostSheetMaterialItem>;
      if (Object.keys(diffTyped).length > 0) row[b.id] = diffTyped;
    }

    if (Object.keys(row).length === 0) delete overrides[targetKey];
    else overrides[targetKey] = row;

    next = {
      ...next,
      material_variant_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    };
  }

  return next;
}

// ---------- 损耗率：内部存小数（如 0.03），界面与 Excel 展示为「3%」----------

/** 将损耗率小数格式化为百分比文案（如 0.03 → 「3%」） */
export function formatWasteRatePercent(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  const p = rate * 100;
  if (Number.isInteger(p) || Math.abs(p - Math.round(p)) < 1e-6) {
    return `${Math.round(p)}%`;
  }
  return `${p.toFixed(2).replace(/\.?0+$/, '')}%`;
}

/**
 * 从 Excel/表单单元格解析损耗率为内部小数。支持：0.03、3、3%、\"3%\"、纯数字大于 1 视为百分数。
 */
export function parseWasteRateFromImportCell(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    if (Math.abs(raw) <= 1) return raw;
    return raw / 100;
  }
  const s0 = String(raw).trim();
  if (!s0) return 0;
  const hasPercent = /%/.test(s0);
  const s = s0.replace(/%/g, '').replace(/，/g, '.').trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  if (hasPercent) return n / 100;
  if (Math.abs(n) > 1) return n / 100;
  return n;
}

// ---------- 计算函数 ----------

/** 物料用量 = 长 × 宽 × 件数 ÷ 布幅 ÷ 36 */
export function calcMaterialUsage(item: CostSheetMaterialItem): number {
  if (item.width && item.fabric_width) {
    return (item.length * item.width * item.pieces) / item.fabric_width / 36;
  }
  // 拉链类：用量 = 长 / 36 × 件数
  return (item.length / 36) * item.pieces;
}

/** 总用量 = 用量 × (1 + 损耗率) */
export function calcMaterialTotalUsage(item: CostSheetMaterialItem): number {
  return calcMaterialUsage(item) * (1 + item.waste_rate);
}

/** 物料小计金额 = 总用量 × 单价 */
export function calcMaterialSubtotal(item: CostSheetMaterialItem): number {
  const totalUsage = calcMaterialTotalUsage(item);
  return totalUsage * (item.unit_price ?? 0);
}

/** 过胶金额 = 总用量 × 过胶单价 */
export function calcGlueAmount(item: CostSheetMaterialItem): number {
  return calcMaterialTotalUsage(item) * (item.glue_price ?? 0);
}

/** 五金金额 = 数量 × 单价 */
export function calcHardwareAmount(item: CostSheetHardwareItem): number {
  return item.quantity * item.unit_price;
}

/** 包装金额 = 数量 × 单价 */
export function calcPackagingAmount(item: CostSheetPackagingItem): number {
  return (item.quantity ?? 0) * (item.unit_price ?? 0);
}

/** 工艺金额 = 数量 × 单价 */
export function calcCraftAmount(item: CostSheetCraftItem): number {
  return item.quantity * item.unit_price;
}

/** 油边金额 = 总长 × 数量 × 单价 */
export function calcOilEdgeAmount(oilEdge: CostSheetOilEdge | null | undefined): number {
  if (!oilEdge) return 0;
  return oilEdge.total_length_inches * oilEdge.quantity * oilEdge.unit_price;
}

/** 按类别分组物料 */
export function groupMaterialsByCategory(items: CostSheetMaterialItem[]): Map<string, CostSheetMaterialItem[]> {
  const map = new Map<string, CostSheetMaterialItem[]>();
  for (const item of items) {
    const existing = map.get(item.category) ?? [];
    existing.push(item);
    map.set(item.category, existing);
  }
  return map;
}

/** 计算某类别物料的小计（用量/总用量/金额/过胶金额分列合计） */
export function calcCategorySubtotal(items: CostSheetMaterialItem[]): {
  /** 用量合计 Σ(用量) */
  sumUsage: number;
  /** 总用量合计 Σ(总用量) */
  sumTotalUsage: number;
  /** 小计金额 Σ(物料金额) */
  totalAmount: number;
  /** 过胶金额合计 Σ(总用量×过胶单价) */
  sumGlueAmount: number;
} {
  let sumUsage = 0;
  let sumTotalUsage = 0;
  let totalAmount = 0;
  let sumGlueAmount = 0;
  for (const item of items) {
    sumUsage += calcMaterialUsage(item);
    sumTotalUsage += calcMaterialTotalUsage(item);
    totalAmount += calcMaterialSubtotal(item);
    sumGlueAmount += calcGlueAmount(item);
  }
  return { sumUsage, sumTotalUsage, totalAmount, sumGlueAmount };
}

/** 计算整张成本表的汇总 */
export function calcCostSheetTotal(sheet: CostSheet): {
  materialTotal: number;
  hardwareTotal: number;
  packagingTotal: number;
  craftTotal: number;
  oilEdgeTotal: number;
  laborTotal: number;
  grandTotal: number;
} {
  const materialTotal = (sheet.material_items ?? []).reduce((s, i) => s + calcMaterialSubtotal(i), 0);
  const hardwareTotal = (sheet.hardware_items ?? []).reduce((s, i) => s + calcHardwareAmount(i), 0);
  const packagingTotal = (sheet.packaging_items ?? []).reduce((s, i) => s + calcPackagingAmount(i), 0);
  const craftTotal = (sheet.craft_items ?? []).reduce((s, i) => s + calcCraftAmount(i), 0);
  const oilEdgeTotal = calcOilEdgeAmount(sheet.oil_edge);

  // 人工从系统设置读取
  const laborSettings = loadLaborCosts();
  const laborTotal = laborSettings.reduce((s, l) => s + l.unit_price, 0);

  const grandTotal = materialTotal + hardwareTotal + packagingTotal + craftTotal + oilEdgeTotal + laborTotal;

  return { materialTotal, hardwareTotal, packagingTotal, craftTotal, oilEdgeTotal, laborTotal, grandTotal };
}

// ---------- 本地存储 ----------

function normalizeCostSheet(s: CostSheet): CostSheet {
  return {
    ...s,
    hardware_items: (s.hardware_items ?? []).map((h) => ({
      ...h,
      material_code: h.material_code ?? null,
      image_url: h.image_url ?? null,
    })),
    ...(s.craft_items != null
      ? {
          craft_items: s.craft_items.map((c) => ({
            ...c,
            image_url: c.image_url ?? null,
          })),
        }
      : {}),
  };
}

export function loadCostSheets(): CostSheet[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.COST_SHEETS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return (parsed as CostSheet[]).map(normalizeCostSheet);
    }
  } catch { /* ignore */ }
  return [];
}

export function saveCostSheets(data: CostSheet[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.COST_SHEETS, JSON.stringify(data));
  } catch { /* quota */ }
}

export function loadLaborCosts(): LaborCostSetting[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LABOR_COSTS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  // 默认人工费用
  return [
    { id: 'labor-1', name: '人工', unit_price: 7, effective_from: '2026-01-01', effective_to: null, created_at: '2026-01-01' },
    { id: 'labor-2', name: 'QC包装', unit_price: 1, effective_from: '2026-01-01', effective_to: null, created_at: '2026-01-01' },
    { id: 'labor-3', name: '加工', unit_price: 25, effective_from: '2026-01-01', effective_to: null, created_at: '2026-01-01' },
  ];
}

export function saveLaborCosts(data: LaborCostSetting[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.LABOR_COSTS, JSON.stringify(data));
  } catch { /* quota */ }
}

/** 获取某款号的最新版本成本表 */
export function getLatestCostSheet(sheets: CostSheet[], patternCode: string): CostSheet | null {
  const matching = sheets
    .filter((s) => s.pattern_code === patternCode)
    .sort((a, b) => b.version - a.version);
  return matching[0] ?? null;
}

/** 获取某款号的所有版本 */
export function getCostSheetVersions(sheets: CostSheet[], patternCode: string): CostSheet[] {
  return sheets
    .filter((s) => s.pattern_code === patternCode)
    .sort((a, b) => b.version - a.version);
}

/** 生成唯一ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建新版本（从现有版本克隆） */
export function cloneCostSheetAsNewVersion(source: CostSheet, allSheets: CostSheet[]): CostSheet {
  const versions = getCostSheetVersions(allSheets, source.pattern_code);
  const maxVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) : 0;

  const newId = generateId();
  const oldMaterialIds = (source.material_items ?? []).map((m) => m.id);
  const newMaterialItems = (source.material_items ?? []).map((item) => ({
    ...item,
    id: generateId(),
    cost_sheet_id: newId,
  }));
  const matIdMap = new Map<string, string>();
  oldMaterialIds.forEach((oid, i) => {
    const nw = newMaterialItems[i]?.id;
    if (nw) matIdMap.set(oid, nw);
  });

  let remappedOverrides = source.material_variant_overrides;
  if (remappedOverrides && matIdMap.size > 0) {
    const nextOv: Record<string, Record<string, Partial<CostSheetMaterialItem>>> = {};
    for (const [vk, rows] of Object.entries(remappedOverrides)) {
      if (vk === '__standard__') continue;
      const nr: Record<string, Partial<CostSheetMaterialItem>> = {};
      for (const [oid, partial] of Object.entries(rows)) {
        const nid = matIdMap.get(oid);
        if (nid) nr[nid] = partial;
      }
      if (Object.keys(nr).length > 0) nextOv[vk] = nr;
    }
    remappedOverrides = Object.keys(nextOv).length > 0 ? nextOv : undefined;
  }

  return {
    ...JSON.parse(JSON.stringify(source)),
    id: newId,
    version: maxVersion + 1,
    status: 'draft' as const,
    created_at: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString().slice(0, 10),
    material_items: newMaterialItems,
    material_variant_overrides: remappedOverrides,
    hardware_items: (source.hardware_items ?? []).map((item) => ({
      ...item,
      id: generateId(),
      cost_sheet_id: newId,
      material_code: item.material_code ?? null,
      image_url: item.image_url ?? null,
    })),
    packaging_items: (source.packaging_items ?? []).map((item) => ({ ...item, id: generateId(), cost_sheet_id: newId })),
    craft_items: (source.craft_items ?? []).map((item) => ({
      ...item,
      id: generateId(),
      cost_sheet_id: newId,
      image_url: item.image_url ?? null,
    })),
    oil_edge: source.oil_edge ? { ...source.oil_edge, id: generateId(), cost_sheet_id: newId } : null,
    color_material_map: (source.color_material_map ?? []).map((item) => ({ ...item, id: generateId(), cost_sheet_id: newId })),
  };
}

/** 对比两个版本的差异 */
export interface CostSheetDiff {
  field: string;        // 字段路径，如 "material_items[0].length"
  label: string;        // 可读标签，如 "主料 - 背带耳仔 - 长"
  oldValue: string | number | null;
  newValue: string | number | null;
}

export function compareCostSheets(oldSheet: CostSheet, newSheet: CostSheet): CostSheetDiff[] {
  const diffs: CostSheetDiff[] = [];

  // 比较物料
  const oldItems = oldSheet.material_items ?? [];
  const newItems = newSheet.material_items ?? [];
  const maxLen = Math.max(oldItems.length, newItems.length);

  for (let i = 0; i < maxLen; i++) {
    const oldItem = oldItems[i];
    const newItem = newItems[i];

    if (!oldItem && newItem) {
      diffs.push({ field: `material_items[${i}]`, label: `${newItem.category} - ${newItem.part_name}`, oldValue: null, newValue: '新增' });
      continue;
    }
    if (oldItem && !newItem) {
      diffs.push({ field: `material_items[${i}]`, label: `${oldItem.category} - ${oldItem.part_name}`, oldValue: '已存在', newValue: '删除' });
      continue;
    }
    if (!oldItem || !newItem) continue;

    const fields: Array<{ key: keyof CostSheetMaterialItem; label: string }> = [
      { key: 'length', label: '长' },
      { key: 'width', label: '宽' },
      { key: 'pieces', label: '件数' },
      { key: 'fabric_width', label: '布幅' },
      { key: 'waste_rate', label: '损耗' },
      { key: 'unit_price', label: '单价' },
      { key: 'remarks', label: '备注' },
    ];

    for (const f of fields) {
      const ov = oldItem[f.key];
      const nv = newItem[f.key];
      const isWaste = f.key === 'waste_rate';
      const isRemarks = f.key === 'remarks';
      const same = isRemarks
        ? (oldItem.remarks ?? '') === (newItem.remarks ?? '')
        : ov === nv;
      if (!same) {
        diffs.push({
          field: `material_items[${i}].${f.key}`,
          label: `${newItem.category} - ${newItem.part_name} - ${f.label}`,
          oldValue: (isWaste ? formatWasteRatePercent(ov as number) : ov) as string | number | null,
          newValue: (isWaste ? formatWasteRatePercent(nv as number) : nv) as string | number | null,
        });
      }
    }
  }

  // 比较五金
  const oldHw = oldSheet.hardware_items ?? [];
  const newHw = newSheet.hardware_items ?? [];
  for (let i = 0; i < Math.max(oldHw.length, newHw.length); i++) {
    const o = oldHw[i]; const n = newHw[i];
    if (!o && n) { diffs.push({ field: `hardware[${i}]`, label: `五金 - ${n.name}`, oldValue: null, newValue: '新增' }); continue; }
    if (o && !n) { diffs.push({ field: `hardware[${i}]`, label: `五金 - ${o.name}`, oldValue: '已存在', newValue: '删除' }); continue; }
    if (o && n) {
      if (o.quantity !== n.quantity) diffs.push({ field: `hardware[${i}].qty`, label: `五金 - ${n.name} - 数量`, oldValue: o.quantity, newValue: n.quantity });
      if (o.unit_price !== n.unit_price) diffs.push({ field: `hardware[${i}].price`, label: `五金 - ${n.name} - 单价`, oldValue: o.unit_price, newValue: n.unit_price });
      if ((o.material_code ?? '') !== (n.material_code ?? '')) {
        diffs.push({
          field: `hardware[${i}].code`,
          label: `五金 - ${n.name} - 编号`,
          oldValue: o.material_code,
          newValue: n.material_code,
        });
      }
    }
  }

  return diffs;
}
