/* ============================================================
 * 成本核算表详情页 - 完整版
 * URL: /cost-sheet/:id
 * 功能：物料/五金/包装/工艺/油边 编辑 + 颜色对照表 + 导出Excel + 版本对比
 * ============================================================ */

'use client';

import { Fragment, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  loadCostSheets,
  saveCostSheets,
  calcMaterialUsage,
  calcMaterialTotalUsage,
  calcMaterialSubtotal,
  calcGlueAmount,
  calcHardwareAmount,
  calcPackagingAmount,
  calcCraftAmount,
  calcOilEdgeAmount,
  calcCostSheetTotal,
  groupMaterialsByCategory,
  calcCategorySubtotal,
  getCostSheetVersions,
  cloneCostSheetAsNewVersion,
  compareCostSheets,
  formatWasteRatePercent,
  parseWasteRateFromImportCell,
  generateId,
  loadLaborCosts,
  getMaterialItemsForVariant,
  getCostSheetForVariantTotals,
  updateMaterialFieldForVariant,
  applyWasteRateForVariant,
  stripMaterialIdFromVariantOverrides,
  applyMaterialVariantGlobalSync,
  type CostSheetDiff,
} from '@/lib/costSheetUtils';
import { exportCostSheetExcel } from '@/lib/costSheetExport';
import {
  getHardwarePriceHeaderBadgeText,
  getHardwarePriceHeaderTitle,
  findHardwareCatalogItem,
  lookupHardwareUnitPrice,
  resolveHardwareTierFromColorMap,
} from '@/lib/hardwarePriceCatalog';
import { getCategoryUnitsDisplay, lookupMaterialUnitFromCatalog } from '@/lib/materialUnitCatalog';
import { loadProductByPatternCode } from '@/app/(dashboard)/products/_components/loadFromStorage';
import { EmbossStampReferencePanel } from '@/app/(dashboard)/cost-sheet/_components/EmbossStampReferencePanel';
import ColorMapChineseColorCell from '@/app/(dashboard)/cost-sheet/_components/ColorMapChineseColorCell';
import { resolveColorMapChineseColor } from '@/lib/skuColorZh';
import { isEmbossStampLabel } from '@/data/embossStampCatalog';
import type {
  CostSheet,
  CostSheetMaterialItem,
  CostSheetHardwareItem,
  CostSheetPackagingItem,
  CostSheetCraftItem,
  LaborCostSetting,
  PackagingDetails,
  ProductionRequirementItem,
} from '@/types';

type ActiveTab = 'detail' | 'usage' | 'colors' | 'packaging' | 'production';

/** 包装材料是否有任意已填项（用于 Tab 小圆点提示） */
function packagingHasAnyContent(p: PackagingDetails | undefined | null): boolean {
  if (!p) return false;
  return Object.values(p).some((v) => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'number') return !Number.isNaN(v);
    return String(v).trim() !== '';
  });
}

function productionHasAnyContent(rows: ProductionRequirementItem[] | undefined | null): boolean {
  if (!rows?.length) return false;
  return rows.some((r) => r.label.trim() !== '' || r.content.trim() !== '');
}

/** 「具体要求」列：按字数、换行与常见长文项（注意事项、包装要求）估算行数，避免固定死高度 */
function productionContentTextareaRows(label: string, content: string): number {
  const t = content.replace(/\r\n/g, '\n');
  const len = t.length;
  if (len === 0) return 4;
  const lineCount = (t.match(/\n/g) ?? []).length + 1;
  const wrapGuess = Math.ceil(len / 46);
  let rows = Math.max(lineCount, wrapGuess);
  const lab = label.trim();
  if (/注意事项|包装要求/.test(lab)) {
    rows = Math.max(rows, Math.ceil(len / 40) + 2);
  }
  if (len > 900) rows += 4;
  else if (len > 500) rows += 3;
  else if (len > 200) rows += 2;
  else if (len > 80) rows += 1;
  return Math.min(34, Math.max(4, rows + 1));
}

function productionContentIsLong(label: string, content: string): boolean {
  const len = content.replace(/\r\n/g, '\n').length;
  return len > 100 || /注意事项|包装要求/.test(label.trim());
}

const COST_SHEET_OPEN_EDIT_KEY = 'cost-sheet-open-edit:';

/** 长/宽在只读模式下展示三位小数；计算仍用 item 内完整浮点值 */
function formatDimDisplay(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '';
  return n.toFixed(3);
}

/** 用量/总用量仅展示 4 位小数；计算仍用完整浮点值 */
function formatUsageDisplay(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-';
  return n.toFixed(4);
}

/** 用于比较/去重损耗率，避免浮点误差 */
function wasteRateKey(rate: number): number {
  return Math.round(rate * 1e6) / 1e6;
}

/** 同一类别下，损耗出现次数少于「众数」的行（如多数 3%、仅一行 5% 则只返回该行 id） */
function materialIdsWithMinorityWasteRate(items: CostSheetMaterialItem[]): string[] {
  if (items.length === 0) return [];
  const freqs = new Map<number, number>();
  for (const i of items) {
    const k = wasteRateKey(i.waste_rate);
    freqs.set(k, (freqs.get(k) ?? 0) + 1);
  }
  let maxFreq = 0;
  for (const c of freqs.values()) maxFreq = Math.max(maxFreq, c);
  return items.filter((i) => (freqs.get(wasteRateKey(i.waste_rate)) ?? 0) < maxFreq).map((i) => i.id);
}

const noSpinnerCls =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** 根据颜色名称推断用于变体按钮的显示颜色 */
function resolveVariantColor(label: string): string {
  const l = label.toUpperCase();
  if (/PINK|粉/.test(l)) return '#EC4899';
  if (/RED|红/.test(l)) return '#EF4444';
  if (/BLUE|蓝/.test(l)) return '#3B82F6';
  if (/GREEN|绿/.test(l)) return '#22C55E';
  if (/PURPLE|紫/.test(l)) return '#A855F7';
  if (/YELLOW|黄/.test(l)) return '#EAB308';
  if (/ORANGE|橙/.test(l)) return '#F97316';
  if (/BROWN|棕|褐/.test(l)) return '#92400E';
  if (/BLACK|黑/.test(l)) return '#1F2937';
  if (/WHITE|白/.test(l)) return '#D1D5DB';
  if (/GOLD|金/.test(l)) return '#D97706';
  if (/SILVER|银/.test(l)) return '#9CA3AF';
  return '#6B7280';
}

export default function CostSheetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sheetId = params.id as string;

  const [allSheets, setAllSheets] = useState<CostSheet[]>([]);
  const [current, setCurrent] = useState<CostSheet | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CostSheet | null>(null);
  const [laborCosts, setLaborCosts] = useState<LaborCostSetting[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('detail');
  /** 从单用量明细跳转时，短暂高亮成本明细中对应物料行 */
  const [highlightMaterialRowIds, setHighlightMaterialRowIds] = useState<Set<string> | null>(null);
  const materialHighlightClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showCompare, setShowCompare] = useState(false);
  const [diffs, setDiffs] = useState<CostSheetDiff[]>([]);
  const [activeVariant, setActiveVariant] = useState<string>('__standard__');
  /** 固定顶部信息卡 / 固定物料表头与左侧列（滚动时保持可见） */
  const [pinTopHeader, setPinTopHeader] = useState(false);
  const [pinMaterialTable, setPinMaterialTable] = useState(false);
  /** 将当前系列物料明细同步到其他主料系列 */
  const [showGlobalSyncModal, setShowGlobalSyncModal] = useState(false);
  const [globalSyncTargets, setGlobalSyncTargets] = useState<Set<string>>(() => new Set());

  /* 固定物料表时顶栏改为紧凑条，避免与「固定顶部信息卡」叠用 */
  useEffect(() => {
    if (pinMaterialTable) setPinTopHeader(false);
  }, [pinMaterialTable]);

  function switchTab(next: ActiveTab) {
    if (next !== 'detail') {
      setHighlightMaterialRowIds(null);
      if (materialHighlightClearRef.current) {
        clearTimeout(materialHighlightClearRef.current);
        materialHighlightClearRef.current = null;
      }
    }
    setActiveTab(next);
  }

  useEffect(() => {
    const sheets = loadCostSheets();
    setAllSheets(sheets);
    const found = sheets.find((s) => s.id === sheetId) ?? null;
    setCurrent(found);
    setLaborCosts(loadLaborCosts());

    const openEdit = sessionStorage.getItem(`${COST_SHEET_OPEN_EDIT_KEY}${sheetId}`);
    if (openEdit) {
      sessionStorage.removeItem(`${COST_SHEET_OPEN_EDIT_KEY}${sheetId}`);
      if (found) {
        setDraft(JSON.parse(JSON.stringify(found)) as CostSheet);
        setEditing(true);
      }
    }
  }, [sheetId]);

  const versions = useMemo(() => {
    if (!current) return [];
    return getCostSheetVersions(allSheets, current.pattern_code);
  }, [allSheets, current]);

  const ds = editing && draft ? draft : current;

  const laborTotal = useMemo(
    () => laborCosts.reduce((s, l) => s + l.unit_price, 0),
    [laborCosts],
  );

  const hardwarePriceBadgeText = useMemo(
    () => (ds ? getHardwarePriceHeaderBadgeText(ds.color_material_map) : ''),
    [ds],
  );
  const hardwarePriceHeaderTitle = useMemo(
    () => (ds ? getHardwarePriceHeaderTitle(ds.color_material_map) : ''),
    [ds],
  );

  /** 颜色变体：按钮列表 + 常规主料系列（用于简表圆点与对照表高亮）
   *  同时合并「做法不同」(method_diff) 的显式变体
   */
  const colorVariantUi = useMemo(() => {
    type Btn = {
      key: string;
      label: string;
      isStandard: boolean;
      colorHint: string;
      /** 'price_diff'=价格不同（自动检测）；'method_diff'=做法不同（Excel独立Sheet） */
      variantType: 'price_diff' | 'method_diff' | null;
    };
    const empty = {
      buttons: [] as Btn[],
      standardSeriesKey: null as string | null,
      mainMaterialKey: null as string | null,
    };
    const colorMap = ds?.color_material_map ?? [];
    const methodDiffKeys = Object.keys(ds?.material_variant_full ?? {});

    // 如果颜色对照表为空，但有「做法不同」变体，也需要展示
    const hasAnyVariant = colorMap.length > 0 || methodDiffKeys.length > 0;
    if (!hasAnyVariant) return empty;

    const allKeys = new Set<string>();
    colorMap.forEach((e) => Object.keys(e.mappings).forEach((k) => allKeys.add(k)));
    const mainKey = Array.from(allKeys).find((k) => k.includes('主料')) ?? null;

    function getSeries(code: string): string {
      const t = (code || '').trim();
      if (!t) return '__empty__';
      const m = t.match(/^([A-Za-z0-9]+)/);
      return m ? m[1].toUpperCase() : t.slice(0, 6).toUpperCase();
    }

    const seriesMap = new Map<string, typeof colorMap>();
    if (mainKey) {
      colorMap.forEach((entry) => {
        const series = getSeries(entry.mappings[mainKey] || '');
        if (!seriesMap.has(series)) seriesMap.set(series, []);
        seriesMap.get(series)!.push(entry);
      });
    }

    let maxCount = 0;
    let stdSeries = '';
    for (const [series, entries] of seriesMap) {
      if (entries.length > maxCount) {
        maxCount = entries.length;
        stdSeries = series;
      }
    }

    const buttons: Btn[] = [];

    // 「价格不同」变体（从主料编号系列自动检测）
    const hasPriceDiffVariants = seriesMap.size > 1;
    // 「做法不同」变体（显式 Sheet 导入）
    const hasMethodDiffVariants = methodDiffKeys.length > 0;

    if (hasPriceDiffVariants || hasMethodDiffVariants) {
      buttons.push({ key: '__standard__', label: '常规', isStandard: true, colorHint: '#374151', variantType: null });
    }

    // 添加「价格不同」变体按钮
    if (hasPriceDiffVariants) {
      for (const [series, entries] of seriesMap) {
        if (series === stdSeries) continue;
        const rep = entries[0];
        const label = rep.color_en?.trim() || rep.color_zh?.trim() || series;
        buttons.push({ key: series, label, isStandard: false, colorHint: resolveVariantColor(label), variantType: 'price_diff' });
      }
    }

    // 添加「做法不同」变体按钮（避免与价格变体重复）
    for (const key of methodDiffKeys) {
      if (buttons.some((b) => b.key === key)) continue;
      const variantTypeValue = ds?.material_variant_type?.[key] ?? 'method_diff';
      buttons.push({
        key,
        label: key,
        isStandard: false,
        colorHint: resolveVariantColor(key),
        variantType: variantTypeValue,
      });
    }

    return { buttons, standardSeriesKey: stdSeries || null, mainMaterialKey: mainKey };
  }, [ds]);

  const activeVariantKey = useMemo(() => {
    if (!ds) return '__standard__';
    const n = colorVariantUi.buttons.length;
    if (n <= 1) return '__standard__';
    return activeVariant;
  }, [ds, colorVariantUi.buttons.length, activeVariant]);

  const variantMaterialItems = useMemo(() => {
    if (!ds) return [];
    return getMaterialItemsForVariant(ds, activeVariantKey);
  }, [ds, activeVariantKey]);

  const materialGroups = useMemo(
    () => groupMaterialsByCategory(variantMaterialItems),
    [variantMaterialItems],
  );
  const totals = useMemo(() => {
    if (!ds) return null;
    return calcCostSheetTotal(getCostSheetForVariantTotals(ds, activeVariantKey));
  }, [ds, activeVariantKey]);

  /** 优先使用「单品管理」中该款号的主图，与产品列表缩略图一致；否则用分色首图，再退回五金行图片 */
  const headerThumbUrl = useMemo(() => {
    if (!ds) return null;
    const product = loadProductByPatternCode(ds.pattern_code);
    if (product?.imageUrl) return product.imageUrl;
    const byColor = product?.productImagesByColor;
    if (byColor && typeof byColor === 'object') {
      for (const urls of Object.values(byColor)) {
        if (Array.isArray(urls) && urls[0] && String(urls[0]).trim()) return String(urls[0]).trim();
      }
    }
    return ds.hardware_items?.find((h) => h.image_url)?.image_url ?? null;
  }, [ds]);

  const colorMapKeys = useMemo(() => {
    if (!ds) return [];
    const keys = new Set<string>();
    (ds.color_material_map ?? []).forEach((e) => Object.keys(e.mappings).forEach((k) => keys.add(k)));
    if (keys.size === 0) ['主料编号', '配料编号', '里布编号', '车线编号', '五金颜色'].forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [ds]);

  /** 单用量·物料表：不含类别名含「拉链」的（拉链行并入下方五金区） */
  const categorySingleUsageRows = useMemo(() => {
    if (!ds) return [];
    const rows: {
      category: string;
      singleUsage: number;
      lossSingleUsage: number;
      unitLabel: string;
      wasteDisplay: string;
      materialIds: string[];
      outlierMaterialIds: string[];
    }[] = [];
    for (const [cat, items] of groupMaterialsByCategory(variantMaterialItems).entries()) {
      if (cat.includes('拉链')) continue;
      const sub = calcCategorySubtotal(items);
      const uniqueRates = Array.from(
        new Map(items.map((i) => [wasteRateKey(i.waste_rate), i.waste_rate] as const)).values(),
      ).sort((a, b) => a - b);
      const wasteDisplay =
        uniqueRates.length === 0 ? '—' : uniqueRates.map((r) => formatWasteRatePercent(r)).join('、');
      const materialIds = items.map((i) => i.id);
      rows.push({
        category: cat,
        singleUsage: sub.sumUsage,
        lossSingleUsage: sub.sumTotalUsage,
        unitLabel: getCategoryUnitsDisplay(items),
        wasteDisplay,
        materialIds,
        outlierMaterialIds: materialIdsWithMinorityWasteRate(items),
      });
    }
    return rows;
  }, [ds, variantMaterialItems]);

  /** outlierIds：与多数行损耗不同的行；为空则只滚动到该类首行、不高亮 */
  function jumpToCostDetailMaterialRows(materialIds: string[], outlierIds: string[]) {
    if (materialIds.length === 0) return;
    const prefer = new Set(outlierIds);
    const scrollToId = materialIds.find((id) => prefer.has(id)) ?? materialIds[0];
    switchTab('detail');
    window.setTimeout(() => {
      document.getElementById(`cost-mi-${scrollToId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (outlierIds.length > 0) {
        setHighlightMaterialRowIds(new Set(outlierIds));
        if (materialHighlightClearRef.current) clearTimeout(materialHighlightClearRef.current);
        materialHighlightClearRef.current = setTimeout(() => {
          setHighlightMaterialRowIds(null);
          materialHighlightClearRef.current = null;
        }, 2800);
      } else {
        setHighlightMaterialRowIds(null);
      }
    }, 60);
  }

  /** 类别含「拉链」的物料行，展示在「五金」区 */
  const zipperMaterialRows = useMemo(
    () => variantMaterialItems.filter((i) => i.category.includes('拉链')),
    [variantMaterialItems],
  );

  function startEdit() {
    if (!current) return;
    if (current.status === 'locked') {
      const nv = cloneCostSheetAsNewVersion(current, allSheets);
      const next = [nv, ...allSheets];
      saveCostSheets(next);
      sessionStorage.setItem(`${COST_SHEET_OPEN_EDIT_KEY}${nv.id}`, '1');
      router.replace(`/cost-sheet/${nv.id}`);
      return;
    }
    setDraft(JSON.parse(JSON.stringify(current)) as CostSheet);
    setEditing(true);
  }
  function cancelEdit() {
    setDraft(null);
    setEditing(false);
  }

  /** 包装材料内联编辑（无导入时也可填写） */
  function updatePackagingDetail(field: keyof PackagingDetails, value: string) {
    if (!draft) return;
    const cur: PackagingDetails = { ...(draft.packaging_details ?? {}) };
    if (field === 'tag_sticker_qty' || field === 'tape_sticker_qty' || field === 'package_weight_kg') {
      const t = value.trim();
      if (!t) {
        delete cur[field];
      } else {
        const n = Number(t);
        if (Number.isFinite(n)) cur[field] = n as never;
      }
    } else {
      if (field === 'notes') {
        if (!value.trim()) delete cur.notes;
        else cur.notes = value;
      } else {
        const t = value.trim();
        if (!t) delete cur[field];
        else (cur as Record<string, unknown>)[field] = t;
      }
    }
    const keys = Object.keys(cur).filter((k) => {
      const v = cur[k as keyof PackagingDetails];
      if (v === undefined || v === null) return false;
      if (typeof v === 'number') return !Number.isNaN(v);
      return String(v).trim() !== '';
    });
    setDraft({
      ...draft,
      packaging_details: keys.length > 0 ? cur : undefined,
    });
  }

  /** 生产要求：左列类别 + 右列说明，行数不固定 */
  function updateProductionItem(id: string, field: 'label' | 'content', value: string) {
    if (!draft) return;
    const list = (draft.production_requirements ?? []).map((row) =>
      row.id === id ? { ...row, [field]: value } : row,
    );
    setDraft({
      ...draft,
      production_requirements: list.length > 0 ? list : undefined,
    });
  }
  function addProductionRow() {
    if (!draft) return;
    const list = [...(draft.production_requirements ?? [])];
    list.push({
      id: generateId(),
      label: '',
      content: '',
      sort_order: list.length,
    });
    setDraft({ ...draft, production_requirements: list });
  }
  function removeProductionRow(id: string) {
    if (!draft) return;
    const list = (draft.production_requirements ?? [])
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, sort_order: i }));
    setDraft({ ...draft, production_requirements: list.length > 0 ? list : undefined });
  }

  function saveEdit() {
    if (!draft) return;
    let u: CostSheet = { ...draft, updated_at: new Date().toISOString().slice(0, 10) };
    if (u.production_requirements?.length) {
      const pruned = u.production_requirements
        .filter((r) => r.label.trim() !== '' || r.content.trim() !== '')
        .map((r, i) => ({ ...r, sort_order: i }));
      u = { ...u, production_requirements: pruned.length > 0 ? pruned : undefined };
    }
    const next = allSheets.map((s) => (s.id === u.id ? u : s));
    setAllSheets(next);
    saveCostSheets(next);
    setCurrent(u);
    setDraft(null);
    setEditing(false);
  }
  function confirmSheet() {
    if (!current) return;
    const u = { ...current, status: 'confirmed' as const, updated_at: new Date().toISOString().slice(0, 10) };
    const next = allSheets.map((s) => (s.id === u.id ? u : s));
    setAllSheets(next);
    saveCostSheets(next);
    setCurrent(u);
  }
  function lockSheet() {
    if (!current || !confirm('锁定后不可直接修改，需要修改时将自动新建版本。确定锁定？')) return;
    const u = { ...current, status: 'locked' as const, updated_at: new Date().toISOString().slice(0, 10) };
    const next = allSheets.map((s) => (s.id === u.id ? u : s));
    setAllSheets(next);
    saveCostSheets(next);
    setCurrent(u);
  }

  function updateMI(id: string, field: keyof CostSheetMaterialItem, value: string | number | null) {
    if (!draft) return;
    setDraft(updateMaterialFieldForVariant(draft, activeVariantKey, id, field, value));
  }
  function addMI(cat: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      material_items: [
        ...(draft.material_items ?? []),
        {
          id: generateId(),
          cost_sheet_id: draft.id,
          category: cat,
          part_name: '',
          length: 0,
          width: null,
          pieces: 1,
          fabric_width: 52,
          waste_rate: 0.03,
          material_code: null,
          unit_price: null,
          oil_edge_inches: null,
          glue_price: null,
          remarks: null,
          sort_order: (draft.material_items ?? []).length,
        },
      ],
    });
  }
  function delMI(id: string) {
    if (!draft) return;
    const stripped = stripMaterialIdFromVariantOverrides(draft, id);
    setDraft({
      ...stripped,
      material_items: (stripped.material_items ?? []).filter((i) => i.id !== id),
    });
  }
  function applyWaste(rate: number) {
    if (!draft) return;
    setDraft(applyWasteRateForVariant(draft, activeVariantKey, rate));
  }

  function updateHW(id: string, field: keyof CostSheetHardwareItem, value: string | number | null) {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const tier = resolveHardwareTierFromColorMap(prev.color_material_map).tier;
      return {
        ...prev,
        hardware_items: (prev.hardware_items ?? []).map((i) => {
          if (i.id !== id) return i;
          let next = { ...i, [field]: value } as CostSheetHardwareItem;
          if (field === 'name' && typeof value === 'string') {
            const cat = findHardwareCatalogItem(value);
            const p = lookupHardwareUnitPrice(value, tier);
            if (cat?.code) next = { ...next, material_code: String(cat.code) };
            if (p != null) next = { ...next, unit_price: p };
          }
          return next;
        }),
      };
    });
  }
  function addHW() {
    if (!draft) return;
    setDraft({
      ...draft,
      hardware_items: [
        ...(draft.hardware_items ?? []),
        {
          id: generateId(),
          cost_sheet_id: draft.id,
          material_code: null,
          image_url: null,
          name: '',
          quantity: 1,
          unit_price: 0,
          sort_order: (draft.hardware_items ?? []).length,
        },
      ],
    });
  }
  function delHW(id: string) {
    if (!draft) return;
    setDraft({ ...draft, hardware_items: (draft.hardware_items ?? []).filter((i) => i.id !== id) });
  }

  function updatePKG(id: string, field: keyof CostSheetPackagingItem, value: string | number | boolean | null) {
    if (!draft) return;
    setDraft({
      ...draft,
      packaging_items: (draft.packaging_items ?? []).map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    });
  }
  function addPKG() {
    if (!draft) return;
    setDraft({
      ...draft,
      packaging_items: [
        ...(draft.packaging_items ?? []),
        {
          id: generateId(),
          cost_sheet_id: draft.id,
          code: null,
          name: '',
          quantity: 1,
          unit_price: 0,
          is_auto_calc: false,
          sort_order: (draft.packaging_items ?? []).length,
        },
      ],
    });
  }
  function delPKG(id: string) {
    if (!draft) return;
    setDraft({ ...draft, packaging_items: (draft.packaging_items ?? []).filter((i) => i.id !== id) });
  }

  function updateCR(id: string, field: keyof CostSheetCraftItem, value: string | number | boolean | null) {
    if (!draft) return;
    setDraft({
      ...draft,
      craft_items: (draft.craft_items ?? []).map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    });
  }
  function addCR() {
    if (!draft) return;
    setDraft({
      ...draft,
      craft_items: [
        ...(draft.craft_items ?? []),
        {
          id: generateId(),
          cost_sheet_id: draft.id,
          image_url: null,
          code: '',
          name: '',
          quantity: 1,
          unit_price: 0,
          is_pattern_bound: false,
          sort_order: (draft.craft_items ?? []).length,
        },
      ],
    });
  }
  function delCR(id: string) {
    if (!draft) return;
    setDraft({ ...draft, craft_items: (draft.craft_items ?? []).filter((i) => i.id !== id) });
  }

  function updateOE(field: 'total_length_inches' | 'quantity' | 'unit_price', value: number): void;
  function updateOE(field: 'remarks', value: string | null): void;
  function updateOE(field: string, value: number | string | null) {
    if (!draft) return;
    const oe =
      draft.oil_edge ??
      {
        id: generateId(),
        cost_sheet_id: draft.id,
        total_length_inches: 0,
        quantity: 1,
        unit_price: 0.01,
      };
    setDraft({ ...draft, oil_edge: { ...oe, [field]: value } });
  }

  function addColorEntry() {
    if (!draft) return;
    const empty: Record<string, string> = {};
    colorMapKeys.forEach((k) => {
      empty[k] = '';
    });
    setDraft({
      ...draft,
      color_material_map: [
        ...(draft.color_material_map ?? []),
        {
          id: generateId(),
          cost_sheet_id: draft.id,
          color_zh: '',
          color_en: '',
          mappings: empty,
        },
      ],
    });
  }
  function updateColorEntry(id: string, field: 'color_zh' | 'color_en', value: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      color_material_map: (draft.color_material_map ?? []).map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    });
  }
  function updateColorMapping(id: string, key: string, value: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      color_material_map: (draft.color_material_map ?? []).map((e) => {
        if (e.id !== id) return e;
        const next = { ...e.mappings, [key]: value };
        return { ...e, mappings: next };
      }),
    });
  }
  function addColorColumn() {
    const k = prompt('添加列名（如：拉链编号）：');
    if (!k?.trim() || !draft) return;
    const key = k.trim();
    let rows = draft.color_material_map ?? [];
    if (rows.length === 0) {
      rows = [
        {
          id: generateId(),
          cost_sheet_id: draft.id,
          color_zh: '',
          color_en: '',
          mappings: { [key]: '' },
        },
      ];
    } else {
      rows = rows.map((e) => ({
        ...e,
        mappings: { ...e.mappings, [key]: e.mappings[key] ?? '' },
      }));
    }
    setDraft({ ...draft, color_material_map: rows });
  }
  function delColorEntry(id: string) {
    if (!draft) return;
    setDraft({ ...draft, color_material_map: (draft.color_material_map ?? []).filter((e) => e.id !== id) });
  }

  function handleCompare(vid: string) {
    const other = allSheets.find((s) => s.id === vid);
    if (!other || !current) return;
    setDiffs(compareCostSheets(other, current));
    setShowCompare(true);
  }

  if (!ds) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-sm">成本表不存在</p>
        <Link href="/cost-sheet" className="mt-3 text-sm text-blue-500 hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  const inputCls =
    'w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400';
  const inputLeftCls =
    'w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400';
  /** 物料表：长/宽等数字列，保证编辑时不被压扁且隐藏 step 箭头 */
  const inputMatDimCls = `w-full min-w-0 max-w-full px-0.5 py-0.5 text-xs border border-gray-200 rounded text-center tabular-nums ${noSpinnerCls} focus:outline-none focus:ring-1 focus:ring-blue-400`;
  const inputMatSmCls = `w-full min-w-0 max-w-full px-0.5 py-0.5 text-xs border border-gray-200 rounded text-center tabular-nums ${noSpinnerCls} focus:outline-none focus:ring-1 focus:ring-blue-400`;
  const inputPartNameCls = `w-full min-w-0 max-w-full px-0.5 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400`;

  /** 与「成本表导入模板」一致：物料区首列为类别，其余与 xlsx 对齐 + 5 列系统计算 */
  const materialAddColSpan = editing ? 16 : 15;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/cost-sheet" className="hover:text-gray-600">
          成本核算表
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{ds.pattern_code}</span>
      </div>

      {/* ── 顶栏：固定物料表时收缩为单行条（约原高度 1/3），仅保留主图/款号/变体/总成本/操作 ── */}
      <div
        className={`bg-white border border-gray-200 rounded-lg shadow-sm ${
          pinMaterialTable
            ? 'sticky top-0 z-40 border-b-2 border-gray-200 p-2 shadow-md'
            : `p-4 ${pinTopHeader ? 'sticky top-0 z-40 border-b-2 border-gray-200 shadow-lg' : ''}`
        }`}
      >
        {pinMaterialTable ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-slate-100 to-slate-200 shadow-inner sm:h-12 sm:w-12">
                {headerThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={headerThumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-400">款</div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-base font-bold text-gray-900 sm:text-lg">{ds.pattern_code}</span>
                  {versions.length > 1 && (
                    <select
                      value={sheetId}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next && next !== sheetId) router.push(`/cost-sheet/${next}`);
                      }}
                      className="max-w-[11rem] shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                      title="切换该款号下的成本表版本"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.version} ({v.created_at})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {colorVariantUi.buttons.length > 0 && (
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {colorVariantUi.buttons.map((v) => {
                      const isActive = activeVariant === v.key;
                      const badgeLabel = v.variantType === 'method_diff' ? '做法不同' : v.variantType === 'price_diff' ? '价格不同' : null;
                      const badgeColor = v.variantType === 'method_diff' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700';
                      const titleHint = v.isStandard ? '常规主料系列' : badgeLabel ? `${badgeLabel}的主料系列` : '特殊颜色主料系列';
                      return (
                        <div key={v.key} className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setActiveVariant(v.key)}
                            className={`inline-flex max-w-[9rem] items-center gap-1 truncate rounded-md px-2 py-1 text-xs font-medium transition-all ${
                              isActive
                                ? 'text-white shadow-sm'
                                : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                            style={isActive ? { backgroundColor: v.colorHint, borderColor: v.colorHint } : undefined}
                            title={titleHint}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10"
                              style={{ backgroundColor: v.colorHint }}
                            />
                            <span className="truncate">{v.label}</span>
                          </button>
                          {badgeLabel && (
                            <span className={`rounded px-1 py-0 text-[9px] font-medium leading-tight ${badgeColor}`}>
                              {badgeLabel}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              {totals && (
                <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-center sm:px-3 sm:py-1.5">
                  <p className="text-[10px] font-medium leading-none text-red-500">总成本</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums leading-none text-red-600 sm:text-xl">
                    ¥{totals.grandTotal.toFixed(2)}
                  </p>
                </div>
              )}
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 sm:px-3 sm:text-sm"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 sm:px-4 sm:text-sm"
                  >
                    保存
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void exportCostSheetExcel(getCostSheetForVariantTotals(ds, activeVariantKey))}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 sm:px-3 sm:text-sm"
                  >
                    ↓ 导出Excel
                  </button>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 sm:px-3 sm:text-sm"
                  >
                    {current?.status === 'locked' ? '新建版本修改' : '编辑'}
                  </button>
                  {current?.status === 'draft' && (
                    <button
                      type="button"
                      onClick={confirmSheet}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 sm:px-4 sm:text-sm"
                    >
                      确认
                    </button>
                  )}
                  {current?.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={lockSheet}
                      className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 sm:px-4 sm:text-sm"
                    >
                      锁定
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
        <div
          className={`grid grid-cols-1 gap-4 xl:items-stretch xl:gap-6 ${
            (ds.color_material_map ?? []).length > 0
              ? 'xl:grid-cols-[minmax(19rem,30%)_minmax(9.5rem,15%)_minmax(0,1fr)]'
              : 'xl:grid-cols-[minmax(19rem,30%)_minmax(0,1fr)]'
          }`}
        >
          {/* 左：大图 + 款号顶对齐图片上沿 */}
          <div className="flex min-w-0 items-start gap-5">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-slate-100 to-slate-200 shadow-inner sm:h-32 sm:w-32 xl:h-36 xl:w-36">
              {headerThumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={headerThumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-slate-400">
                  款
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-start gap-2.5 pl-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-gray-800">{ds.pattern_code}</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${
                    ds.status === 'draft'
                      ? 'bg-amber-100 text-amber-700'
                      : ds.status === 'confirmed'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {ds.status === 'draft' ? '草稿' : ds.status === 'confirmed' ? '已确认' : '已锁定'}
                </span>
                <span className="text-sm text-gray-400">v{ds.version}</span>
              </div>
              {colorVariantUi.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2.5">
                  {colorVariantUi.buttons.map((v) => {
                    const isActive = activeVariant === v.key;
                    const badgeLabel = v.variantType === 'method_diff' ? '做法不同' : v.variantType === 'price_diff' ? '价格不同' : null;
                    const badgeColor = v.variantType === 'method_diff' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700';
                    return (
                      <div key={v.key} className="flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setActiveVariant(v.key)}
                          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-base font-medium transition-all ${
                            isActive
                              ? 'text-white shadow-sm'
                              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          style={isActive ? { backgroundColor: v.colorHint, borderColor: v.colorHint } : undefined}
                          title={v.isStandard ? '多数颜色共用相同主料系列' : badgeLabel ? `${badgeLabel}的主料系列` : '该颜色主料系列与常规不同'}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10"
                            style={{ backgroundColor: v.colorHint }}
                          />
                          {v.label}
                        </button>
                        {badgeLabel && (
                          <span className={`rounded px-1.5 py-0 text-[10px] font-medium leading-tight ${badgeColor}`}>
                            {badgeLabel}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-sm text-gray-500">
                颜色：共<span className="font-semibold text-gray-800">{(ds.color_material_map ?? []).length}</span>个
              </p>
            </div>
          </div>

          {/* 中：颜色简表（条数多时在固定高度内纵向滚动，右侧显示滚动条） */}
          {(ds.color_material_map ?? []).length > 0 && (
            <div className="min-h-0 w-full max-w-[13rem] min-w-0 justify-self-start self-start overflow-hidden rounded-lg border border-gray-200 bg-gray-50/40 xl:max-w-[14rem]">
              <div
                className={[
                  'min-h-0 max-h-[14rem] overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth touch-pan-y',
                  'pr-0.5 [scrollbar-width:thin] [scrollbar-color:rgb(156_163_175)_rgb(243_244_246)]',
                  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100',
                  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400',
                ].join(' ')}
              >
                <table className="w-full table-fixed text-xs leading-snug">
                  <colgroup>
                    <col className="w-[45%]" />
                    <col className="w-[55%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-100/95 backdrop-blur-sm">
                    <tr>
                      <th className="px-1.5 py-1.5 text-left font-medium text-gray-600">颜色(中文)</th>
                      <th className="px-1.5 py-1.5 text-center font-medium text-gray-600">Color(英文)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ds.color_material_map ?? []).map((entry) => {
                      const mk = colorVariantUi.mainMaterialKey;
                      let rowSeries = '';
                      if (mk) {
                        const code = (entry.mappings[mk] || '').trim();
                        const m = code.match(/^([A-Za-z0-9]+)/);
                        rowSeries = m ? m[1].toUpperCase() : code.slice(0, 6).toUpperCase();
                      }
                      const isNonStandard =
                        colorVariantUi.buttons.length > 1 &&
                        colorVariantUi.standardSeriesKey != null &&
                        rowSeries !== colorVariantUi.standardSeriesKey;
                      const dotColor = resolveVariantColor(entry.color_en || entry.color_zh || '');
                      // 检查是否有「做法不同」的成本表引用
                      const costRefKey = entry.cost_sheet_ref
                        ? (() => {
                            const m = entry.cost_sheet_ref.match(/成本表[\s(（]+([^)）]+)[)）]?/);
                            return m ? m[1].trim() : entry.cost_sheet_ref.trim();
                          })()
                        : null;
                      const isMethodDiff = costRefKey
                        ? !!ds.material_variant_full?.[costRefKey]
                        : false;
                      return (
                        <tr key={entry.id} className="border-b border-gray-100/80 bg-white/80 last:border-0">
                          <td className="truncate px-1.5 py-1 font-medium text-gray-800" title={undefined}>
                            <span className="inline-flex max-w-full items-center gap-1">
                              {isNonStandard && !isMethodDiff && (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full border border-black/10"
                                  style={{ backgroundColor: dotColor }}
                                />
                              )}
                              {isMethodDiff && (
                                <span className="shrink-0 rounded bg-purple-100 px-0.5 text-[8px] font-semibold leading-tight text-purple-700">
                                  做法
                                </span>
                              )}
                              <span className="min-w-0 truncate">
                                <ColorMapChineseColorCell colorZh={entry.color_zh} colorEn={entry.color_en} compact />
                              </span>
                            </span>
                          </td>
                          <td className="truncate px-1.5 py-1 text-center text-gray-700" title={entry.color_en || undefined}>
                            {entry.color_en || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(ds.color_material_map ?? []).length > 6 && (
                <p className="border-t border-gray-200 bg-gray-50/90 px-1.5 py-1 text-center text-[10px] leading-tight text-gray-400">
                  可向下滑动查看全部颜色
                </p>
              )}
            </div>
          )}

          {/* 右：顶部操作按钮；分项+总成本贴卡片底，与底边留缝 */}
          <div className="flex min-w-0 flex-col xl:h-full">
            <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => setPinTopHeader((v) => !v)}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  pinTopHeader
                    ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                }`}
                title={pinTopHeader ? '取消固定顶部信息区' : '固定顶部信息区（滚动时保持可见）'}
                aria-pressed={pinTopHeader}
              >
                <PinFixIcon active={pinTopHeader} />
              </button>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    保存
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void exportCostSheetExcel(getCostSheetForVariantTotals(ds, activeVariantKey))}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    ↓ 导出Excel
                  </button>
                  {versions.length > 1 && (
                    <select
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.value = '';
                        if (v) handleCompare(v);
                      }}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        版本对比...
                      </option>
                      {versions
                        .filter((v) => v.id !== current?.id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version} ({v.created_at})
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded-md border border-blue-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
                  >
                    {current?.status === 'locked' ? '新建版本修改' : '编辑'}
                  </button>
                  {current?.status === 'draft' && (
                    <button
                      type="button"
                      onClick={confirmSheet}
                      className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      确认
                    </button>
                  )}
                  {current?.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={lockSheet}
                      className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      锁定
                    </button>
                  )}
                </>
              )}
            </div>

            {activeVariant !== '__standard__' && colorVariantUi.buttons.length > 1 && (
              <p className="mt-2 max-w-sm shrink-0 text-right text-[11px] leading-snug text-amber-700 xl:ml-auto xl:text-right">
                当前为特殊颜色变体，主料编号与常规不同，物料单价可能存在差异。
              </p>
            )}
            {colorVariantUi.buttons.length > 1 && (
              <p className="mt-1 max-w-sm shrink-0 text-right text-[11px] leading-snug text-gray-500 xl:ml-auto xl:text-right">
                各系列物料尺寸等可分别保存；若要复制到其它系列，请点编辑后使用「全局同步」。
              </p>
            )}

            {totals && (
              <div className="mt-auto w-full min-w-0 pt-4 xl:pb-1.5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
                  <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    {(
                      [
                        { label: '材料', val: totals.materialTotal },
                        { label: '五金', val: totals.hardwareTotal },
                        { label: '包装', val: totals.packagingTotal },
                        { label: '工艺', val: totals.craftTotal },
                        { label: '油边', val: totals.oilEdgeTotal },
                        { label: '人工', val: totals.laborTotal },
                      ] as const
                    ).map(({ label, val }) => (
                      <div
                        key={label}
                        className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-2.5 text-center leading-tight"
                      >
                        <span className="text-sm text-gray-500">{label}</span>
                        <span className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">¥{val.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mx-auto shrink-0 lg:mx-0">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-center">
                      <p className="text-sm font-medium leading-none text-red-500/90">总成本</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums leading-none text-red-600">
                        ¥{totals.grandTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      <div className="flex items-center border-b border-gray-200 gap-0">
        <button
          type="button"
          onClick={() => switchTab('detail')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'detail' ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          成本明细
        </button>
        <button
          type="button"
          onClick={() => switchTab('usage')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'usage' ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          单用量明细
        </button>
        <button
          type="button"
          onClick={() => switchTab('colors')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'colors' ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          颜色物料对照表{' '}
          {(ds.color_material_map ?? []).length > 0 && `(${(ds.color_material_map ?? []).length})`}
        </button>
        <button
          type="button"
          onClick={() => switchTab('packaging')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'packaging' ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          包装材料
          {packagingHasAnyContent(ds.packaging_details) && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" title="已有填写内容" />
          )}
        </button>
        <button
          type="button"
          onClick={() => switchTab('production')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'production' ? 'border-gray-800 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          生产要求
          {productionHasAnyContent(ds.production_requirements) && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" title="已有填写内容" />
          )}
        </button>
      </div>

      {activeTab === 'detail' && (
        <>
          <div className={`bg-white border border-gray-200 rounded-lg ${pinMaterialTable ? '' : 'overflow-x-auto'}`}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="font-semibold text-gray-700">物料明细</h2>
                <button
                  type="button"
                  onClick={() => setPinMaterialTable((v) => !v)}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    pinMaterialTable
                      ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  title={pinMaterialTable ? '取消固定表头与左侧列' : '固定表头与左侧列（类别、部件名称、长、宽）'}
                  aria-pressed={pinMaterialTable}
                >
                  <PinFixIcon active={pinMaterialTable} />
                </button>
              </div>
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const r = prompt('统一损耗率（填百分数，如 3 表示 3%；也支持 0.03、3%）：', '3');
                      if (r != null && String(r).trim() !== '') {
                        applyWaste(parseWasteRateFromImportCell(r));
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    统一设置损耗
                  </button>
                  {colorVariantUi.buttons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!draft) return;
                        const keys = colorVariantUi.buttons.map((b) => b.key).filter((k) => k !== activeVariantKey);
                        setGlobalSyncTargets(new Set(keys));
                        setShowGlobalSyncModal(true);
                      }}
                      className="text-xs text-violet-700 hover:text-violet-900"
                      title="把当前所选主料系列的物料明细同步到其他系列"
                    >
                      全局同步…
                    </button>
                  )}
                </>
              )}
            </div>
            <div className={pinMaterialTable ? 'max-h-[min(65vh,640px)] overflow-auto' : 'overflow-x-auto'}>
            <table
              className={`w-full table-fixed border-collapse text-xs sm:text-sm ${pinMaterialTable ? 'relative' : ''}`}
            >
              <colgroup>
                {/* 与桌面「成本表导入模板」列宽比例接近：类别 + 部件偏宽，数字列偏窄 */}
                <col className="w-[4.25rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[3rem]" />
                <col className="w-[3rem]" />
                <col className="w-[2rem]" />
                <col className="w-[2rem]" />
                <col className="w-[2.25rem]" />
                <col className="w-[2.5rem]" />
                <col className="w-[2.75rem]" />
                <col className="min-w-[4.5rem] w-[6.5rem]" />
                <col className="w-[2.75rem]" />
                <col className="w-[2.75rem]" />
                <col className="w-[2.5rem]" />
                <col className="w-[2.75rem]" />
                <col className="w-[2.75rem]" />
                {editing && <col className="w-[2rem]" />}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200">
                  {/* 与导入模板一致：A 列类别；B–G #333，H–J #D8DCE3；本表按类别分组着色，首列仍显示类别名 */}
                  <th
                    className={`px-0.5 py-2 text-left text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky left-0 top-0 z-[37] shadow-[1px_0_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block leading-tight">类别</span>
                  </th>
                  <th
                    className={`px-1 py-2 text-left text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky left-[4.25rem] top-0 z-[36] shadow-[1px_0_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block leading-tight">部件名称</span>
                  </th>
                  <th
                    className={`px-0.5 py-2 text-center text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky left-[9.75rem] top-0 z-[35] shadow-[1px_0_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    长
                  </th>
                  <th
                    className={`px-0.5 py-2 text-center text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky left-[12.75rem] top-0 z-[34] shadow-[1px_0_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    宽
                  </th>
                  <th
                    className={`px-0.5 py-2 text-center text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky left-[15.75rem] top-0 z-[33] shadow-[1px_0_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    件数
                  </th>
                  <th
                    className={`px-0.5 py-2 text-center text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    布幅
                  </th>
                  <th
                    className={`px-0.5 py-2 text-center text-[11px] font-semibold text-white bg-[#333333] ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    损耗
                  </th>
                  <th className="px-0.5 py-2 text-center text-[11px] font-semibold text-[#333333] bg-[#D8DCE3]">油边/寸</th>
                  <th className="px-0.5 py-2 text-right text-[11px] font-semibold text-[#333333] bg-[#D8DCE3]">过胶单价</th>
                  <th className="px-1 py-2 text-left text-[11px] font-semibold text-[#333333] bg-[#D8DCE3]">备注</th>
                  <th
                    className={`border-l border-gray-300 px-0.5 py-2 text-right text-[10px] font-semibold leading-tight text-gray-700 bg-gray-200 ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block text-[9px] font-normal text-gray-500">系统</span>
                    用量
                  </th>
                  <th
                    className={`px-0.5 py-2 text-right text-[10px] font-semibold leading-tight text-gray-700 bg-gray-200 ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block text-[9px] font-normal text-gray-500">系统</span>
                    总用量
                  </th>
                  <th
                    className={`px-0.5 py-2 text-right text-[10px] font-semibold leading-tight text-gray-700 bg-gray-200 ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block text-[9px] font-normal text-gray-500">系统</span>
                    单价
                  </th>
                  <th
                    className={`px-0.5 py-2 text-right text-[10px] font-semibold leading-tight text-gray-700 bg-gray-200 ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block text-[9px] font-normal text-gray-500">系统</span>
                    小计金额
                  </th>
                  <th
                    className={`py-2 pl-0.5 pr-2 text-right text-[10px] font-semibold leading-tight text-gray-700 bg-gray-200 ${
                      pinMaterialTable ? 'sticky top-0 z-20 shadow-[0_1px_0_0_rgb(229_231_235)]' : ''
                    }`}
                  >
                    <span className="block text-[9px] font-normal text-gray-500">系统</span>
                    过胶金额
                  </th>
                  {editing && (
                    <th className="px-0.5 py-2 text-center text-[11px] font-medium text-gray-500 bg-gray-50" />
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from(materialGroups.entries()).map(([cat, items]) => {
                  const sub = calcCategorySubtotal(items);
                  const bg =
                    cat === '主料'
                      ? 'bg-yellow-50'
                      : cat === '配料'
                        ? 'bg-green-50'
                        : cat === '里布'
                          ? 'bg-blue-50'
                          : cat.includes('辅料')
                            ? 'bg-red-50'
                            : cat.includes('拉链') || cat.includes('织带')
                              ? 'bg-purple-50'
                              : 'bg-gray-50';
                  return (
                    <Fragment key={cat}>
                      {items.map((item: CostSheetMaterialItem, idx: number) => {
                        const u = calcMaterialUsage(item);
                        const tu = calcMaterialTotalUsage(item);
                        const st = calcMaterialSubtotal(item);
                        const glueAmt = calcGlueAmount(item);
                        const rowFlash = highlightMaterialRowIds?.has(item.id) ?? false;
                        return (
                          <tr
                            key={item.id}
                            id={`cost-mi-${item.id}`}
                            className={`group border-b border-gray-100 transition-shadow duration-300 ${
                              rowFlash
                                ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/60'
                                : `${bg} hover:brightness-[0.99]`
                            }`}
                          >
                            {(editing || idx === 0) && (
                              <td
                                rowSpan={!editing && items.length > 1 ? items.length : undefined}
                                className={`min-w-0 px-0.5 py-1 align-middle ${
                                  pinMaterialTable
                                    ? 'sticky left-0 z-[28] bg-white/95 shadow-[1px_0_0_0_rgb(229_231_235)] group-hover:bg-white/90'
                                    : ''
                                }`}
                              >
                                {editing ? (
                                  <input
                                    type="text"
                                    value={item.category}
                                    onChange={(e) => updateMI(item.id, 'category', e.target.value)}
                                    className={`${inputPartNameCls} text-center`}
                                    title="类别"
                                  />
                                ) : (
                                  <span
                                    className="flex min-h-[2rem] items-center justify-center text-center text-xs font-medium text-gray-700"
                                    title={cat}
                                  >
                                    {cat}
                                  </span>
                                )}
                              </td>
                            )}
                            <td
                              className={`min-w-0 px-1 py-1 align-top ${
                                pinMaterialTable
                                  ? 'sticky left-[4.25rem] z-[27] bg-white/95 shadow-[1px_0_0_0_rgb(229_231_235)] group-hover:bg-white/90'
                                  : ''
                              }`}
                            >
                              {editing ? (
                                <input
                                  type="text"
                                  value={item.part_name}
                                  onChange={(e) => updateMI(item.id, 'part_name', e.target.value)}
                                  className={inputPartNameCls}
                                />
                              ) : (
                                <span className="block truncate text-left text-gray-800" title={item.part_name}>
                                  {item.part_name}
                                </span>
                              )}
                            </td>
                            <td
                              className={`min-w-0 px-0.5 py-1 text-center align-top ${
                                pinMaterialTable
                                  ? 'sticky left-[9.75rem] z-[26] bg-white/95 shadow-[1px_0_0_0_rgb(229_231_235)] group-hover:bg-white/90'
                                  : ''
                              }`}
                            >
                              {editing ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={item.length || ''}
                                  onChange={(e) => updateMI(item.id, 'length', Number(e.target.value) || 0)}
                                  className={inputMatDimCls}
                                />
                              ) : (
                                <span className="tabular-nums" title={item.length ? String(item.length) : undefined}>
                                  {formatDimDisplay(item.length)}
                                </span>
                              )}
                            </td>
                            <td
                              className={`min-w-0 px-0.5 py-1 text-center align-top ${
                                pinMaterialTable
                                  ? 'sticky left-[12.75rem] z-[25] bg-white/95 shadow-[1px_0_0_0_rgb(229_231_235)] group-hover:bg-white/90'
                                  : ''
                              }`}
                            >
                              {editing ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={item.width ?? ''}
                                  onChange={(e) => updateMI(item.id, 'width', e.target.value ? Number(e.target.value) : null)}
                                  className={inputMatDimCls}
                                />
                              ) : (
                                <span className="tabular-nums" title={item.width != null ? String(item.width) : undefined}>
                                  {formatDimDisplay(item.width)}
                                </span>
                              )}
                            </td>
                            <td
                              className={`min-w-0 px-0.5 py-1 text-center align-top ${
                                pinMaterialTable
                                  ? 'sticky left-[15.75rem] z-[24] bg-white/95 shadow-[1px_0_0_0_rgb(229_231_235)] group-hover:bg-white/90'
                                  : ''
                              }`}
                            >
                              {editing ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={item.pieces}
                                  onChange={(e) => updateMI(item.id, 'pieces', Number(e.target.value) || 1)}
                                  className={inputMatSmCls}
                                />
                              ) : (
                                item.pieces
                              )}
                            </td>
                            <td
                              className={`min-w-0 px-0.5 py-1 text-center align-top ${editing ? 'bg-amber-50/40' : ''}`}
                            >
                              {editing ? (
                                <input
                                  type="number"
                                  value={item.fabric_width ?? ''}
                                  onChange={(e) => updateMI(item.id, 'fabric_width', e.target.value ? Number(e.target.value) : null)}
                                  className={`${inputMatSmCls} border-amber-200/35 bg-white/90`}
                                />
                              ) : (
                                (item.fabric_width ?? '')
                              )}
                            </td>
                            <td
                              className={`min-w-0 px-0.5 py-1 text-center align-top ${editing ? 'bg-amber-50/40' : ''}`}
                            >
                              {editing ? (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  title="按百分数填写，如 3 表示 3%"
                                  value={Number.isFinite(item.waste_rate) ? item.waste_rate * 100 : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      updateMI(item.id, 'waste_rate', 0);
                                      return;
                                    }
                                    const n = Number(raw);
                                    if (!Number.isFinite(n)) return;
                                    updateMI(item.id, 'waste_rate', n / 100);
                                  }}
                                  className={`${inputMatSmCls} border-amber-200/35 bg-white/90`}
                                />
                              ) : (
                                formatWasteRatePercent(item.waste_rate)
                              )}
                            </td>
                            <td className="min-w-0 px-0.5 py-1 text-center align-top tabular-nums text-slate-600">
                              {editing ? (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  value={item.oil_edge_inches ?? ''}
                                  onChange={(e) =>
                                    updateMI(
                                      item.id,
                                      'oil_edge_inches',
                                      e.target.value === '' ? null : Number(e.target.value),
                                    )
                                  }
                                  className={`${inputMatSmCls} text-slate-700 border-slate-200`}
                                />
                              ) : (
                                <span className="text-xs font-medium tabular-nums">{item.oil_edge_inches ?? ''}</span>
                              )}
                            </td>
                            <td className="min-w-0 px-0.5 py-1 text-right align-top tabular-nums text-slate-600">
                              {editing ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={item.glue_price ?? ''}
                                  onChange={(e) =>
                                    updateMI(item.id, 'glue_price', e.target.value === '' ? null : Number(e.target.value))
                                  }
                                  className={`${inputMatSmCls} border-slate-200 text-slate-700`}
                                />
                              ) : (
                                (item.glue_price != null ? item.glue_price.toFixed(3) : '')
                              )}
                            </td>
                            <td className="min-w-0 px-1 py-1 align-top text-xs text-slate-600">
                              {editing ? (
                                <input
                                  type="text"
                                  value={item.remarks ?? ''}
                                  onChange={(e) => updateMI(item.id, 'remarks', e.target.value.trim() === '' ? null : e.target.value)}
                                  className={`${inputPartNameCls} border-slate-200 text-slate-700 placeholder:text-slate-400`}
                                  placeholder="选填"
                                />
                              ) : (
                                <span className="block max-w-full break-words leading-snug" title={item.remarks ?? undefined}>
                                  {item.remarks ?? ''}
                                </span>
                              )}
                            </td>
                            <td
                              className="min-w-0 border-l border-gray-200 px-0.5 py-1 text-right align-top tabular-nums text-xs text-gray-700 bg-gray-50/80"
                              title={u > 0 ? String(u) : undefined}
                            >
                              {formatUsageDisplay(u)}
                            </td>
                            <td
                              className="min-w-0 px-0.5 py-1 text-right align-top tabular-nums text-xs text-gray-700 bg-gray-50/80"
                              title={tu > 0 ? String(tu) : undefined}
                            >
                              {formatUsageDisplay(tu)}
                            </td>
                            <td className="min-w-0 px-0.5 py-1 text-right align-top tabular-nums text-green-700 font-medium bg-gray-50/80">
                              {item.unit_price != null ? item.unit_price.toFixed(2) : '-'}
                            </td>
                            <td className="min-w-0 px-0.5 py-1 text-right align-top tabular-nums bg-gray-50/80">{st > 0 ? st.toFixed(2) : '-'}</td>
                            <td className="min-w-0 py-1 pl-0.5 pr-2 text-right align-top tabular-nums text-gray-800 bg-gray-50/80">
                              {item.glue_price != null ? glueAmt.toFixed(2) : ''}
                            </td>
                            {editing && (
                              <td className="min-w-0 px-0.5 py-1 text-center align-top">
                                <button
                                  type="button"
                                  onClick={() => delMI(item.id)}
                                  className="text-red-400 hover:text-red-600 text-xs"
                                >
                                  ✕
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      <tr className="border-b border-gray-300 bg-gray-100">
                        <td className="px-1 py-1.5 text-xs font-semibold text-red-600" colSpan={7}>
                          小计{' '}
                          <span className="text-[10px] font-normal text-gray-500">[{cat}]</span>{' '}
                          {editing && (
                            <button
                              type="button"
                              onClick={() => addMI(cat)}
                              className="ml-1 font-normal text-blue-500 hover:text-blue-700"
                            >
                              + 添加行
                            </button>
                          )}
                        </td>
                        <td />
                        <td />
                        <td />
                        <td
                          className="border-l border-gray-200 px-0.5 py-1.5 text-right text-xs font-semibold tabular-nums text-red-600"
                          title={sub.sumUsage > 0 ? String(sub.sumUsage) : undefined}
                        >
                          {sub.sumUsage > 0 ? sub.sumUsage.toFixed(4) : '-'}
                        </td>
                        <td
                          className="px-0.5 py-1.5 text-right text-xs font-semibold tabular-nums text-red-600"
                          title={sub.sumTotalUsage > 0 ? String(sub.sumTotalUsage) : undefined}
                        >
                          {sub.sumTotalUsage > 0 ? sub.sumTotalUsage.toFixed(4) : '-'}
                        </td>
                        <td />
                        <td className="px-0.5 py-1.5 text-right text-xs font-semibold tabular-nums text-red-600">{sub.totalAmount.toFixed(2)}</td>
                        <td className="py-1.5 pl-0.5 pr-2 text-right text-xs font-semibold tabular-nums text-red-600">
                          {items.some((i: CostSheetMaterialItem) => i.glue_price != null) ? sub.sumGlueAmount.toFixed(2) : ''}
                        </td>
                        {editing && <td />}
                      </tr>
                    </Fragment>
                  );
                })}
                {editing && (
                  <tr>
                    <td colSpan={materialAddColSpan} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const c = prompt('新类别名称：');
                          if (c) addMI(c.trim());
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        + 添加新类别
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          <SectionTable
            title="五金"
            bg="bg-orange-50"
            headers={['图片', '编号', '名称', '数量', '单价', '金额', '备注']}
            columnHeaderExtra={{
              4: (
                <span
                  className="ml-1 align-middle font-normal text-[10px] leading-none text-amber-800 whitespace-nowrap"
                  title={hardwarePriceHeaderTitle}
                >
                  （{hardwarePriceBadgeText}）
                </span>
              ),
            }}
            editing={editing}
            onAdd={addHW}
            addLabel="+ 添加五金"
            items={ds.hardware_items ?? []}
            renderRow={(item: CostSheetHardwareItem) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-1 py-1.5 text-center align-middle w-16">
                  {editing ? (
                    <input
                      type="url"
                      value={item.image_url ?? ''}
                      onChange={(e) => updateHW(item.id, 'image_url', e.target.value || null)}
                      placeholder="图片URL"
                      className="w-full px-1 py-0.5 text-[10px] border border-gray-200 rounded"
                    />
                  ) : item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="mx-auto h-9 w-9 rounded border border-gray-100 object-cover"
                    />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center text-xs tabular-nums">
                  {editing ? (
                    <input
                      type="text"
                      value={item.material_code ?? ''}
                      onChange={(e) => updateHW(item.id, 'material_code', e.target.value || null)}
                      className={inputCls}
                    />
                  ) : (
                    (item.material_code ?? '—')
                  )}
                </td>
                <td className="px-3 py-1.5 text-left">
                  {editing ? (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateHW(item.id, 'name', e.target.value)}
                      className={inputLeftCls}
                    />
                  ) : (
                    item.name
                  )}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums align-middle">
                  {editing ? (
                    <input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => updateHW(item.id, 'quantity', Number(e.target.value) || 0)}
                      className={`${inputCls} tabular-nums`}
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums align-middle">
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateHW(item.id, 'unit_price', Number(e.target.value) || 0)}
                      className={`${inputCls} tabular-nums`}
                    />
                  ) : (
                    item.unit_price.toFixed(2)
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums align-middle">{calcHardwareAmount(item).toFixed(2)}</td>
                <td className="px-2 py-1.5 align-top min-w-[100px]">
                  {editing ? (
                    <input
                      type="text"
                      value={item.remarks ?? ''}
                      onChange={(e) => updateHW(item.id, 'remarks', e.target.value || null)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded"
                    />
                  ) : (
                    <span className="text-xs text-gray-600">{item.remarks ?? ''}</span>
                  )}
                </td>
                {editing && (
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delHW(item.id)} className="text-red-400 hover:text-red-600 text-xs">
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            )}
            subtotalAmount={(ds.hardware_items ?? []).reduce((s, i) => s + calcHardwareAmount(i), 0)}
            subtotalLabel="五金小计"
          />

          <SectionTable
            title="包装"
            bg="bg-pink-50"
            headers={['编号', '名称', '数量', '单价', '金额', '备注']}
            editing={editing}
            onAdd={addPKG}
            addLabel="+ 添加包装"
            items={ds.packaging_items ?? []}
            renderRow={(item: CostSheetPackagingItem) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1.5 text-center">
                  {editing ? (
                    <input
                      type="text"
                      value={item.code ?? ''}
                      onChange={(e) => updatePKG(item.id, 'code', e.target.value || null)}
                      className={inputCls}
                    />
                  ) : (
                    (item.code ?? '—')
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {editing ? (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updatePKG(item.id, 'name', e.target.value)}
                      className={inputLeftCls}
                    />
                  ) : (
                    item.name
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {item.is_auto_calc ? (
                    <span className="text-xs text-gray-400">自动</span>
                  ) : editing ? (
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={item.quantity ?? ''}
                      onChange={(e) => updatePKG(item.id, 'quantity', e.target.value ? Number(e.target.value) : null)}
                      className={inputCls}
                    />
                  ) : (
                    (item.quantity ?? '—')
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {editing ? (
                    <input
                      type="number"
                      step="0.001"
                      value={item.unit_price ?? ''}
                      onChange={(e) => updatePKG(item.id, 'unit_price', e.target.value ? Number(e.target.value) : null)}
                      className={inputCls}
                    />
                  ) : (
                    (item.unit_price?.toFixed(3) ?? '—')
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {calcPackagingAmount(item) > 0 ? calcPackagingAmount(item).toFixed(2) : '-'}
                </td>
                <td className="px-2 py-1.5 align-top min-w-[100px]">
                  {editing ? (
                    <input
                      type="text"
                      value={item.remarks ?? ''}
                      onChange={(e) => updatePKG(item.id, 'remarks', e.target.value || null)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded"
                    />
                  ) : (
                    <span className="text-xs text-gray-600">{item.remarks ?? ''}</span>
                  )}
                </td>
                {editing && (
                  <td className="px-2 py-1.5 text-center">
                    <label className="flex items-center justify-center gap-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={item.is_auto_calc}
                        onChange={(e) => updatePKG(item.id, 'is_auto_calc', e.target.checked)}
                      />
                      自动
                    </label>
                    <button type="button" onClick={() => delPKG(item.id)} className="text-red-400 hover:text-red-600 text-xs block mx-auto mt-1">
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            )}
            subtotalAmount={(ds.packaging_items ?? []).reduce((s, i) => s + calcPackagingAmount(i), 0)}
            subtotalLabel="包装小计"
          />

          <SectionTable
            title="工艺"
            bg="bg-blue-50"
            headers={['图片', '编号', '名称', '数量', '单价', '金额', '备注']}
            editing={editing}
            onAdd={addCR}
            addLabel="+ 添加工艺"
            items={ds.craft_items ?? []}
            renderRow={(item: CostSheetCraftItem) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-1 py-1.5 text-center align-middle w-16">
                  {editing ? (
                    <input
                      type="url"
                      value={item.image_url ?? ''}
                      onChange={(e) => updateCR(item.id, 'image_url', e.target.value || null)}
                      placeholder="图片URL"
                      className="w-full px-1 py-0.5 text-[10px] border border-gray-200 rounded"
                    />
                  ) : item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="mx-auto h-9 w-9 rounded border border-gray-100 object-cover"
                    />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="min-w-[140px] px-2 py-1.5 text-center align-middle">
                  {editing ? (
                    <input
                      type="text"
                      value={item.code}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateCR(item.id, 'code', val);
                        updateCR(item.id, 'is_pattern_bound', val === ds.pattern_code);
                      }}
                      className={`${inputCls} min-w-[120px]`}
                    />
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <span>{item.code}</span>
                      {item.is_pattern_bound && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-500">
                          款号
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {editing ? (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateCR(item.id, 'name', e.target.value)}
                      className={inputLeftCls}
                    />
                  ) : (
                    item.name
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {editing ? (
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateCR(item.id, 'quantity', Number(e.target.value) || 1)}
                      className={inputCls}
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateCR(item.id, 'unit_price', Number(e.target.value) || 0)}
                      className={inputCls}
                    />
                  ) : (
                    item.unit_price.toFixed(2)
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{calcCraftAmount(item).toFixed(2)}</td>
                <td className="px-2 py-1.5 align-top min-w-[100px]">
                  {editing ? (
                    <input
                      type="text"
                      value={item.remarks ?? ''}
                      onChange={(e) => updateCR(item.id, 'remarks', e.target.value || null)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded"
                    />
                  ) : (
                    <span className="text-xs text-gray-600">{item.remarks ?? ''}</span>
                  )}
                </td>
                {editing && (
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delCR(item.id)} className="text-red-400 hover:text-red-600 text-xs">
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            )}
            subtotalAmount={(ds.craft_items ?? []).reduce((s, i) => s + calcCraftAmount(i), 0)}
            subtotalLabel="工艺小计"
          />

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200 bg-yellow-50">
              <h2 className="font-semibold text-gray-700">油边</h2>
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-4">
              <div>
                <span className="text-xs text-gray-500">总长(寸)</span>
                {editing ? (
                  <input
                    type="number"
                    value={ds.oil_edge?.total_length_inches ?? ''}
                    onChange={(e) => updateOE('total_length_inches', Number(e.target.value) || 0)}
                    className="ml-2 w-20 px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  <span className="ml-2 font-medium">{ds.oil_edge?.total_length_inches ?? '-'}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-gray-500">数量</span>
                {editing ? (
                  <input
                    type="number"
                    min={1}
                    value={ds.oil_edge?.quantity ?? 1}
                    onChange={(e) => updateOE('quantity', Number(e.target.value) || 1)}
                    className="ml-2 w-20 px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  <span className="ml-2 font-medium">{ds.oil_edge?.quantity ?? 1}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-gray-500">单价(/寸)</span>
                {editing ? (
                  <input
                    type="number"
                    step="0.001"
                    value={ds.oil_edge?.unit_price ?? 0.01}
                    onChange={(e) => updateOE('unit_price', Number(e.target.value) || 0.01)}
                    className="ml-2 w-20 px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  <span className="ml-2 font-medium">{ds.oil_edge?.unit_price ?? 0.01}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-gray-500">金额</span>
                <span className="ml-2 font-semibold text-red-600">{calcOilEdgeAmount(ds.oil_edge).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">备注</span>
                {editing ? (
                  <input
                    type="text"
                    value={ds.oil_edge?.remarks ?? ''}
                    onChange={(e) => updateOE('remarks', e.target.value || null)}
                    className="ml-1 w-40 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  ds.oil_edge?.remarks ? (
                    <span className="ml-1 text-sm text-gray-600">{ds.oil_edge.remarks}</span>
                  ) : null
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200 bg-teal-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">人工费用</h2>
              <span className="text-xs text-gray-400">来自系统统一设置</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {laborCosts.map((lc) => (
                  <tr key={lc.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{lc.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">¥{lc.unit_price.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100">
                  <td className="px-3 py-1.5 font-semibold text-red-600">人工小计</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-red-600 tabular-nums">¥{laborTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {totals && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg px-5 py-4 flex items-center justify-between">
              <span className="font-bold text-gray-800 text-lg">总成本 (RMB)</span>
              <span className="font-bold text-red-600 text-2xl tabular-nums">¥{totals.grandTotal.toFixed(2)}</span>
            </div>
          )}
        </>
      )}

      {activeTab === 'usage' && (
        <div className="flex flex-col gap-4 max-w-5xl">
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 text-xs text-gray-600 leading-relaxed">
            <p className="font-medium text-gray-700">单用量明细</p>
            <p className="mt-1">
              物料按类别汇总用量；「损耗」为成本明细中该类别下各部件损耗率（相同则单列，多种则并列），可点击跳转至成本明细并定位；「单位」来自价格管理物料库匹配。类别名含「拉链」的物料归在下方五金区。五金只显示数量与损耗数量（拉链类物料对应用量/总用量）；包装仅数量；工艺仅编号与数量；油边仅总长与数量。
            </p>
          </div>

          <UsageSummarySection
            title="物料（按类别）"
            description="单用量、损耗、损耗单用量与成本明细各类别行一致；损耗列为该类别下各部件损耗率汇总（多种时并列显示）；单位按该行类别下物料从价格库匹配（多种单位时合并显示）。点击损耗可跳转成本明细并定位到该类物料。"
            accentClass="bg-slate-50"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-600">类别</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600 tabular-nums">单用量</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">单位</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">损耗</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 tabular-nums">损耗单用量</th>
                </tr>
              </thead>
              <tbody>
                {categorySingleUsageRows.map((row) => (
                  <tr key={row.category} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-3 py-2 font-medium text-gray-800">{row.category}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-800" title={row.singleUsage > 0 ? String(row.singleUsage) : undefined}>
                      {formatUsageDisplay(row.singleUsage)}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-700">{row.unitLabel}</td>
                    <td className="px-2 py-2 text-center text-gray-800">
                      {row.materialIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => jumpToCostDetailMaterialRows(row.materialIds, row.outlierMaterialIds)}
                          className="text-blue-600 hover:text-blue-800 hover:underline tabular-nums"
                          title="在成本明细中查看该类物料的损耗"
                        >
                          {row.wasteDisplay}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums text-gray-800"
                      title={row.lossSingleUsage > 0 ? String(row.lossSingleUsage) : undefined}
                    >
                      {formatUsageDisplay(row.lossSingleUsage)}
                    </td>
                  </tr>
                ))}
                {categorySingleUsageRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                      暂无物料数据（若仅有拉链类物料，请见下方五金区）
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </UsageSummarySection>

          <UsageSummarySection
            title="五金（含拉链类物料）"
            description="五金行：数量、损耗数量；拉链类物料行：数量=用量、损耗数量=总用量（与成本明细算法一致）。单位来自价格管理。不显示单价与金额。"
            accentClass="bg-orange-50"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-2 text-center font-medium text-gray-600 w-14">图片</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">编号</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">单位</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600 tabular-nums">数量</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600 tabular-nums">损耗数量</th>
                </tr>
              </thead>
              <tbody>
                {zipperMaterialRows.map((z) => {
                  const u = calcMaterialUsage(z);
                  const tu = calcMaterialTotalUsage(z);
                  const unit = lookupMaterialUnitFromCatalog(z.part_name, z.material_code);
                  return (
                    <tr key={`zip-${z.id}`} className="border-b border-gray-100 bg-amber-50/40" title="拉链类物料（自成本明细并入）">
                      <td className="px-1 py-2 text-center text-gray-400">—</td>
                      <td className="px-2 py-2 text-center text-xs text-gray-700 tabular-nums">{z.material_code ?? '—'}</td>
                      <td className="px-3 py-2 text-left text-gray-800">{z.part_name}</td>
                      <td className="px-2 py-2 text-center text-gray-700">{unit}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-gray-800">{formatUsageDisplay(u)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-gray-800">{formatUsageDisplay(tu)}</td>
                    </tr>
                  );
                })}
                {(ds.hardware_items ?? []).map((h) => {
                  const unit = lookupMaterialUnitFromCatalog(h.name, h.material_code);
                  return (
                    <tr key={h.id} className="border-b border-gray-100">
                      <td className="px-1 py-2 text-center align-middle">
                        {h.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.image_url} alt="" className="mx-auto h-8 w-8 rounded border border-gray-100 object-cover" />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-gray-700 tabular-nums">{h.material_code ?? '—'}</td>
                      <td className="px-3 py-2 text-left text-gray-800">{h.name}</td>
                      <td className="px-2 py-2 text-center text-gray-700">{unit}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-gray-800">{h.quantity}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-gray-400">—</td>
                    </tr>
                  );
                })}
                {zipperMaterialRows.length === 0 && (ds.hardware_items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      暂无五金及拉链类物料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </UsageSummarySection>

          <UsageSummarySection title="包装" description="仅展示数量（不显示单价、金额）。" accentClass="bg-pink-50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-2 text-center font-medium text-gray-600">编号</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">数量</th>
                </tr>
              </thead>
              <tbody>
                {(ds.packaging_items ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="px-2 py-2 text-center text-gray-700">{p.code ?? '—'}</td>
                    <td className="px-3 py-2 text-left text-gray-800">{p.name}</td>
                    <td className="px-2 py-2 text-center text-gray-800">
                      {p.is_auto_calc ? <span className="text-xs text-gray-400">自动</span> : (p.quantity ?? '—')}
                    </td>
                  </tr>
                ))}
                {(ds.packaging_items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                      暂无包装数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </UsageSummarySection>

          <UsageSummarySection title="工艺" description="仅编号、名称与数量；图片与单价、金额见上方成本明细。" accentClass="bg-blue-50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-2 text-center font-medium text-gray-600">编号</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-600">数量</th>
                </tr>
              </thead>
              <tbody>
                {(ds.craft_items ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-2 py-2 text-center text-gray-800">
                      <span className="inline-flex items-center gap-1">
                        {c.code}
                        {c.is_pattern_bound && (
                          <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">款号</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left text-gray-800">{c.name}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-gray-800">{c.quantity}</td>
                  </tr>
                ))}
                {(ds.craft_items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                      暂无工艺数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </UsageSummarySection>

          <UsageSummarySection title="油边" description="仅总长与数量（不显示单价、金额）。" accentClass="bg-yellow-50">
            {ds.oil_edge ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-center font-medium text-gray-600">总长(寸)</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600">数量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 text-center tabular-nums text-gray-800">{ds.oil_edge.total_length_inches}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-gray-800">{ds.oil_edge.quantity}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-gray-400">未填写油边</p>
            )}
          </UsageSummarySection>
        </div>
      )}

      {activeTab === 'colors' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">颜色-物料对照表</h2>
            <div className="flex items-center gap-2">
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={addColorColumn}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    + 添加列
                  </button>
                  <button
                    type="button"
                    onClick={addColorEntry}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    + 添加颜色
                  </button>
                </>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-medium text-gray-500">颜色(中文)</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500">Color(英文)</th>
                {colorMapKeys.map((k) => (
                  <th key={k} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[140px]">
                    {k}
                  </th>
                ))}
                {(ds.color_material_map ?? []).some((e) => e.cost_sheet_ref) && (
                  <th className="px-2 py-2 text-center font-medium text-gray-500 min-w-[120px]">成本表引用</th>
                )}
                {editing && <th className="px-2 py-2 w-12" />}
              </tr>
            </thead>
            <tbody>
              {(ds.color_material_map ?? []).map((entry, idx) => {
                // 判断此行是否属于非标准变体（价格不同/做法不同）
                const variantForRow = colorVariantUi.buttons.find(
                  (v) =>
                    !v.isStandard &&
                    v.key !== '__standard__' &&
                    (() => {
                      // 优先按 cost_sheet_ref 匹配「做法不同」变体
                      if (entry.cost_sheet_ref && v.variantType === 'method_diff') {
                        const m = entry.cost_sheet_ref.match(/成本表[\s(（]+([^)）]+)[)）]?/);
                        const refKey = m ? m[1].trim() : entry.cost_sheet_ref.trim();
                        return refKey === v.key;
                      }
                      // 否则按主料编号系列匹配「价格不同」变体
                      const mainKey = colorVariantUi.mainMaterialKey ?? colorMapKeys.find((k) => k.includes('主料'));
                      if (!mainKey) return false;
                      const code = (entry.mappings[mainKey] || '').trim();
                      const m = code.match(/^([A-Za-z0-9]+)/);
                      const series = m ? m[1].toUpperCase() : code.slice(0, 6).toUpperCase();
                      return series === v.key;
                    })(),
                );
                const isSpecialVariant = !!variantForRow;
                const isMethodDiffRow = variantForRow?.variantType === 'method_diff';
                return (
                <tr key={entry.id} className={`border-b border-gray-100 ${idx % 2 === 0 && !isSpecialVariant ? 'bg-gray-50/50' : isMethodDiffRow ? 'bg-purple-50/30' : ''}`}>
                  <td className="px-3 py-1.5 font-semibold">
                    {editing ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={entry.color_zh}
                          onChange={(e) => updateColorEntry(entry.id, 'color_zh', e.target.value)}
                          className={inputLeftCls}
                          placeholder="留空则按右侧英文自动翻译"
                        />
                        {!entry.color_zh.trim() && entry.color_en.trim() && (
                          <p className="text-[10px] font-normal text-slate-500">
                            将显示：
                            <span className="font-medium text-slate-600">
                              {resolveColorMapChineseColor('', entry.color_en).text}
                            </span>
                            （自动）
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {isSpecialVariant && !isMethodDiffRow && (
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10 inline-block"
                            style={{ backgroundColor: variantForRow.colorHint }}
                          />
                        )}
                        {isMethodDiffRow && (
                          <span className="shrink-0 rounded bg-purple-100 px-0.5 text-[9px] font-semibold leading-tight text-purple-700">
                            做法
                          </span>
                        )}
                        <ColorMapChineseColorCell colorZh={entry.color_zh} colorEn={entry.color_en} />
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {editing ? (
                      <input
                        type="text"
                        value={entry.color_en}
                        onChange={(e) => updateColorEntry(entry.id, 'color_en', e.target.value)}
                        className={inputCls}
                      />
                    ) : (
                      entry.color_en
                    )}
                  </td>
                  {colorMapKeys.map((k) => {
                    const isMainKey = k.includes('主料');
                    const cellIsVariant = isSpecialVariant && !isMethodDiffRow && isMainKey;
                    return (
                    <td
                      key={k}
                      className="px-2 py-1.5 text-center"
                      style={cellIsVariant ? { outline: `2px solid ${variantForRow?.colorHint}`, outlineOffset: '-2px', borderRadius: '4px' } : undefined}
                    >
                      {editing ? (
                        <input
                          type="text"
                          value={entry.mappings[k] ?? ''}
                          onChange={(e) => updateColorMapping(entry.id, k, e.target.value)}
                          className={inputCls}
                        />
                      ) : (
                        (entry.mappings[k] || <span className="text-gray-300">-</span>)
                      )}
                    </td>
                    );
                  })}
                  {(ds.color_material_map ?? []).some((e) => e.cost_sheet_ref) && (
                    <td className="px-2 py-1.5 text-center">
                      {entry.cost_sheet_ref ? (
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${isMethodDiffRow ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          {entry.cost_sheet_ref}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {editing && (
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => delColorEntry(entry.id)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
              {(ds.color_material_map ?? []).length === 0 && (
                <tr>
                  <td colSpan={colorMapKeys.length + 3} className="px-4 py-12 text-center text-gray-400">
                    暂无颜色物料对照数据{' '}
                    {editing && (
                      <button type="button" onClick={addColorEntry} className="text-blue-600 hover:underline ml-1">
                        添加
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            <p>• 留空 = 该物料所有颜色相同，不需要区分</p>
            <p>• 系统通过物料编号自动从物料库匹配单价和布幅</p>
          </div>
        </div>
      )}

      {/* ── 包装材料 Tab（始终展示；点击「编辑」后可填写，亦可 Excel 导入） ── */}
      {activeTab === 'packaging' && (() => {
        const pkg = ds.packaging_details ?? {};
        const ro = !editing;
        return (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <h2 className="font-semibold text-gray-700">包装材料</h2>
              <span className="text-xs text-gray-400">
                {editing ? '填写后点击「保存」写入本成本表' : '点击「编辑」在此填写；也可通过 Excel 导入「包装材料」Sheet'}
              </span>
            </div>
            <div className="p-5 bg-slate-50/30 rounded-b-lg border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
                {/* 第1列：布袋 + 胶袋（胶袋紧贴布袋下方，与 Excel 参考一致） */}
                <div className="flex min-w-0 flex-col gap-5">
                {/* ── 布袋 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">布袋</h3>
                  </div>
                  <div className="p-3.5 space-y-3.5">
                    {(
                      [
                        ['LOGO位置 / 高度注上(CM)', 'cloth_bag_logo_position' as const],
                        ['LOGO型号', 'cloth_bag_logo_type' as const],
                        ['长 × 高(CM)', 'cloth_bag_size' as const],
                        ['手腕中高', 'cloth_bag_wrist_height' as const],
                      ] as const
                    ).map(([label, key]) => {
                      const v = pkg[key];
                      return (
                        <div key={key}>
                          <div className="text-[11px] font-medium text-gray-500 mb-1">{label}</div>
                          {ro ? (
                            <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                              {v !== undefined && v !== null && String(v).trim() !== '' ? (
                                <span className="font-medium text-slate-800">{String(v)}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-300 transition-colors"
                              value={v ?? ''}
                              onChange={(e) => updatePackagingDetail(key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── 胶袋 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">胶袋</h3>
                  </div>
                  <div className="p-3.5 space-y-3.5">
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-1">规格(CM)</div>
                      {ro ? (
                        <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                          {pkg.plastic_bag_size?.trim() ? (
                            <span className="font-medium text-slate-800">{pkg.plastic_bag_size}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white transition-colors"
                          value={pkg.plastic_bag_size ?? ''}
                          onChange={(e) => updatePackagingDetail('plastic_bag_size', e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                </div>
                </div>

                {/* 第2列：贴纸 */}
                <div className="flex min-w-0 flex-col gap-5">
                {/* ── 贴纸 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">贴纸</h3>
                  </div>
                  <div className="p-3.5 space-y-3.5">
                    {(
                      [
                        ['吊牌贴纸', '（常规 6×2.5CM）', 'tag_sticker_qty' as const],
                        ['胶带贴纸', '（常规 10×3.5CM）', 'tape_sticker_qty' as const],
                      ] as const
                    ).map(([label, hint, key]) => {
                      const v = pkg[key];
                      return (
                        <div key={key}>
                          <div className="mb-1 text-[11px] font-medium text-gray-500">
                            {label}
                            <span className="ml-1 font-normal text-gray-400">{hint}</span>
                          </div>
                          {ro ? (
                            <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                              {v != null ? (
                                <span className="font-medium text-slate-800 tabular-nums">{String(v)}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400 transition-colors tabular-nums"
                              value={v != null ? String(v) : ''}
                              onChange={(e) => updatePackagingDetail(key, e.target.value)}
                              placeholder="数量"
                            />
                          )}
                        </div>
                      );
                    })}
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-gray-500">
                        纸箱贴纸
                        <span className="ml-1 font-normal text-gray-400">（常规 10×3.5CM）</span>
                      </div>
                      {ro ? (
                        <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                          {pkg.carton_sticker_note?.trim() ? (
                            <span className="font-medium text-slate-800">{pkg.carton_sticker_note}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400 transition-colors"
                          value={pkg.carton_sticker_note ?? ''}
                          onChange={(e) => updatePackagingDetail('carton_sticker_note', e.target.value)}
                          placeholder="数量或备注"
                        />
                      )}
                    </div>
                  </div>
                </div>
                </div>

                {/* 第3列：洗水唛 + 纸箱 */}
                <div className="flex min-w-0 flex-col gap-5">
                {/* ── 洗水唛 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">洗水唛</h3>
                  </div>
                  <div className="p-3.5 space-y-3.5">
                    {(
                      [
                        ['印刷的PO#', 'wash_label_po' as const],
                        ['规格（大/小）', 'wash_label_size' as const],
                      ] as const
                    ).map(([label, key]) => {
                      const v = pkg[key];
                      return (
                        <div key={key}>
                          <div className="text-[11px] font-medium text-gray-500 mb-1">{label}</div>
                          {ro ? (
                            <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                              {v?.trim() ? (
                                <span className="font-medium text-slate-800">{v}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white transition-colors"
                              value={v ?? ''}
                              onChange={(e) => updatePackagingDetail(key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── 纸箱 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">纸箱</h3>
                  </div>
                  <div className="p-3.5 space-y-3.5">
                    {(
                      [
                        ['尺寸(CM)', 'carton_size' as const],
                        ['每箱/数量', 'carton_qty_per_box' as const],
                      ] as const
                    ).map(([label, key]) => {
                      const v = pkg[key];
                      return (
                        <div key={key}>
                          <div className="text-[11px] font-medium text-gray-500 mb-1">{label}</div>
                          {ro ? (
                            <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                              {v?.trim() ? (
                                <span className="font-medium text-slate-800">{v}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white transition-colors"
                              value={v ?? ''}
                              onChange={(e) => updatePackagingDetail(key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                </div>

                {/* 第4列：包装信息 + 备注 */}
                <div className="flex min-w-0 flex-col gap-5">
                {/* ── 包装信息 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">包装信息</h3>
                  </div>
                  <div className="p-3.5 space-y-3.5">
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-1">包装尺寸(CM)</div>
                      {ro ? (
                        <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                          {pkg.package_size?.trim() ? (
                            <span className="font-medium text-slate-800">{pkg.package_size}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white transition-colors"
                          value={pkg.package_size ?? ''}
                          onChange={(e) => updatePackagingDetail('package_size', e.target.value)}
                        />
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-1">重量(kg)</div>
                      {ro ? (
                        <div className="min-h-[32px] px-2.5 py-1.5 flex items-center bg-slate-50/50 rounded border border-gray-100 text-[13px]">
                          {pkg.package_weight_kg != null && !Number.isNaN(pkg.package_weight_kg) ? (
                            <span className="font-medium text-slate-800 tabular-nums">{pkg.package_weight_kg}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full h-8 px-2.5 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white transition-colors tabular-nums"
                          value={pkg.package_weight_kg != null ? String(pkg.package_weight_kg) : ''}
                          onChange={(e) => updatePackagingDetail('package_weight_kg', e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── 备注 ── */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="bg-slate-50 border-b border-gray-200 px-3.5 py-2.5 flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-slate-400 rounded-sm"></div>
                    <h3 className="text-[13px] font-bold text-slate-700">备注</h3>
                  </div>
                  <div className="p-3.5">
                    {ro ? (
                      <div className="min-h-[64px] px-3 py-2 bg-slate-50/50 rounded border border-gray-100 text-[13px] whitespace-pre-wrap">
                        {pkg.notes?.trim() ? (
                          <span className="font-medium text-slate-800">{pkg.notes}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                    ) : (
                      <textarea
                        rows={3}
                        className="w-full px-3 py-2 text-[13px] rounded border border-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white placeholder-gray-400 transition-colors"
                        value={pkg.notes ?? ''}
                        onChange={(e) => updatePackagingDetail('notes', e.target.value)}
                        placeholder="选填，包装相关的特殊说明..."
                      />
                    )}
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {activeTab === 'production' && (() => {
        const rows = [...(ds.production_requirements ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        const ro = !editing;
        return (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <h2 className="font-semibold text-gray-700">生产要求</h2>
              <span className="text-xs text-gray-400">
                {editing
                  ? '左列为类别（如五金、油边、注意事项），右列为说明；行数与项目均可自由增减。保存时会去掉完全空白的行。'
                  : '与导入模板中「生产要求」Sheet 对应；点击「编辑」可在此增删改。'}
              </span>
            </div>
            <div className="p-4">
              {rows.length === 0 && ro ? (
                <p className="text-sm text-gray-400">
                  暂无内容。请使用含「生产要求」工作表的模板导入，或点击「编辑」后添加行。
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[min(100%,640px)] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-600">
                          <th className="w-[22%] border-b border-gray-200 px-3 py-2">要求项</th>
                          <th className="border-b border-gray-200 px-3 py-2">具体要求</th>
                          {editing && <th className="w-16 border-b border-gray-200 px-2 py-2 text-center">操作</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const longBody = productionContentIsLong(row.label, row.content);
                          const taRows = productionContentTextareaRows(row.label, row.content);
                          const embossRow = isEmbossStampLabel(row.label);
                          return (
                          <tr key={row.id} className="border-b border-gray-100 align-top">
                            <td className={`px-3 ${longBody ? 'py-3' : 'py-2'}`}>
                              {ro ? (
                                <span className="whitespace-pre-wrap text-gray-800">
                                  {row.label.trim() ? row.label : '—'}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  className={inputLeftCls}
                                  value={row.label}
                                  onChange={(e) => updateProductionItem(row.id, 'label', e.target.value)}
                                  placeholder="如：五金、油边、注意事项"
                                />
                              )}
                            </td>
                            <td className={`px-3 ${longBody ? 'py-3' : 'py-2'}`}>
                              <div className="space-y-2">
                                {ro ? (
                                  <div
                                    className={`whitespace-pre-wrap text-gray-800 ${
                                      longBody ? 'leading-relaxed text-[13px]' : 'leading-normal'
                                    }`}
                                  >
                                    {row.content.trim() ? row.content : '—'}
                                  </div>
                                ) : (
                                  <textarea
                                    rows={taRows}
                                    className={`${inputLeftCls} w-full resize-y ${
                                      longBody ? 'leading-relaxed text-[13px]' : ''
                                    } ${embossRow ? 'font-mono text-[13px]' : ''}`}
                                    style={{
                                      minHeight: longBody
                                        ? `${Math.min(720, Math.max(100, taRows * 22 + 16))}px`
                                        : undefined,
                                    }}
                                    value={row.content}
                                    onChange={(e) => updateProductionItem(row.id, 'content', e.target.value)}
                                    placeholder={
                                      embossRow
                                        ? '每行一条，例如：\n4#，内唛\n1#，盖面*2'
                                        : '详细说明（可多行）'
                                    }
                                  />
                                )}
                                {embossRow && <EmbossStampReferencePanel />}
                              </div>
                            </td>
                            {editing && (
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  className="text-xs text-red-600 hover:text-red-800"
                                  onClick={() => removeProductionRow(row.id)}
                                >
                                  删除
                                </button>
                              </td>
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {editing && (
                    <button
                      type="button"
                      onClick={addProductionRow}
                      className="mt-3 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      + 添加一行
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {showGlobalSyncModal && draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowGlobalSyncModal(false);
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-base font-semibold text-gray-800">全局同步物料明细</h2>
              <button
                type="button"
                onClick={() => setShowGlobalSyncModal(false)}
                className="text-xl leading-none text-gray-400 hover:text-gray-600"
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-gray-600">
                将当前系列「
                <span className="font-medium text-gray-900">
                  {colorVariantUi.buttons.find((b) => b.key === activeVariantKey)?.label ?? '常规'}
                </span>
                」表格中的物料数据，写入下方选中的目标系列（会覆盖对应行中的长宽厚、损耗、油边等可编辑字段）。
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-800"
                  onClick={() => {
                    const keys = colorVariantUi.buttons.map((b) => b.key).filter((k) => k !== activeVariantKey);
                    setGlobalSyncTargets(new Set(keys));
                  }}
                >
                  全选
                </button>
                <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => setGlobalSyncTargets(new Set())}>
                  全不选
                </button>
              </div>
              <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-gray-100 bg-gray-50/50 p-3">
                {colorVariantUi.buttons
                  .filter((b) => b.key !== activeVariantKey)
                  .map((b) => (
                    <li key={b.key}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={globalSyncTargets.has(b.key)}
                          onChange={() => {
                            setGlobalSyncTargets((prev) => {
                              const n = new Set(prev);
                              if (n.has(b.key)) n.delete(b.key);
                              else n.add(b.key);
                              return n;
                            });
                          }}
                        />
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm border border-black/10"
                          style={{ backgroundColor: b.colorHint }}
                        />
                        {b.label}
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                type="button"
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setShowGlobalSyncModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
                onClick={() => {
                  if (!draft) return;
                  if (globalSyncTargets.size === 0) {
                    alert('请至少选择一个目标系列');
                    return;
                  }
                  const baseSnapshot = JSON.parse(JSON.stringify(draft.material_items ?? [])) as CostSheetMaterialItem[];
                  const sourceMerged = getMaterialItemsForVariant(draft, activeVariantKey);
                  setDraft(
                    applyMaterialVariantGlobalSync(draft, {
                      baseSnapshot,
                      sourceMerged,
                      targetKeys: Array.from(globalSyncTargets),
                    }),
                  );
                  setShowGlobalSyncModal(false);
                }}
              >
                确定同步
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompare && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCompare(false);
          }}
          role="presentation"
        >
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">版本对比</h2>
              <button
                type="button"
                onClick={() => setShowCompare(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
              {diffs.length === 0 ? (
                <p className="text-center text-gray-400 py-8">两个版本完全相同</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-2 py-2 text-left text-gray-500">修改项</th>
                      <th className="px-2 py-2 text-center text-gray-500">旧值</th>
                      <th className="px-2 py-2 text-center text-gray-500">新值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((d, i) => (
                      <tr key={i} className="border-b border-gray-100 bg-yellow-50">
                        <td className="px-2 py-2 text-gray-700">{d.label}</td>
                        <td className="px-2 py-2 text-center text-red-500 line-through">{d.oldValue ?? '-'}</td>
                        <td className="px-2 py-2 text-center text-green-600 font-semibold">{d.newValue ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageSummarySection({
  title,
  description,
  accentClass,
  children,
}: {
  title: string;
  description?: string;
  accentClass: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-200 ${accentClass}`}>
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        {description ? <p className="text-xs text-gray-600 mt-1 leading-relaxed">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** 固定：未激活为线框图钉，激活为实心 */
function PinFixIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.709 16.709 0 006.682-6.6c.53-1.281.808-2.66.808-4.049 0-4.224-3.426-7.65-7.65-7.65-4.224 0-7.65 3.426-7.65 7.65 0 001.409 4.275 15.65 15.65 0 006.562 6.561zm.38-17.55c1.29 0 2.36 1.03 2.36 2.36 0 1.29-1.03 2.36-2.36 2.36-1.29 0-2.36-1.03-2.36-2.36 0-1.29 1.03-2.36 2.36-2.36z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function SC({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`border rounded-lg px-3 py-2 ${accent ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-bold mt-0.5 tabular-nums ${accent ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

/** 表头与单元格对齐一致：名称左对齐，数量/单价/编号等居中，金额右对齐 */
function sectionTableHeaderClass(headers: string[], i: number): string {
  const label = headers[i];
  const base = 'px-2 py-2 font-medium text-gray-500';
  if (i === headers.length - 1) return `${base} text-right`;
  if (label === '名称' || label === '部件名称') return `${base} text-left min-w-[120px]`;
  if (label === '图片') return `${base} text-center w-16`;
  if (
    [
      '数量',
      '单价',
      '编号',
      '金额',
      '长',
      '宽',
      '件数',
      '布幅',
      '损耗',
      '总用量',
      '小计金额',
      '油边/寸',
      '过胶单价',
      '过胶金额',
      '备注',
    ].includes(label)
  ) {
    return `${base} text-center`;
  }
  return `${base} text-left`;
}

function SectionTable<T extends { id: string }>({
  title,
  bg,
  headers,
  columnHeaderExtra,
  editing,
  onAdd,
  addLabel,
  items,
  renderRow,
  subtotalAmount,
  subtotalLabel,
}: {
  title: string;
  bg: string;
  headers: string[];
  /** 表头单元格旁附加说明，key 为 headers 下标 */
  columnHeaderExtra?: Record<number, ReactNode>;
  editing: boolean;
  onAdd: () => void;
  addLabel: string;
  items: T[];
  renderRow: (item: T) => ReactNode;
  subtotalAmount: number;
  subtotalLabel: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <div className={`px-4 py-3 border-b border-gray-200 ${bg}`}>
        <h2 className="font-semibold text-gray-700">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((h, i) => (
              <th key={`${h}-${i}`} className={sectionTableHeaderClass(headers, i)}>
                <span className="inline-flex flex-wrap items-center justify-center gap-x-0.5">
                  {h}
                  {columnHeaderExtra?.[i]}
                </span>
              </th>
            ))}
            {editing && <th className="px-2 py-2 w-12" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => renderRow(item))}
          {editing && (
            <tr>
              <td colSpan={headers.length + 1} className="px-3 py-2">
                <button type="button" onClick={onAdd} className="text-sm text-blue-600 hover:text-blue-800">
                  {addLabel}
                </button>
              </td>
            </tr>
          )}
          <tr className="bg-gray-100 border-t border-gray-300">
            {headers[headers.length - 1] === '备注' ? (
              <>
                <td className="px-3 py-1.5 font-semibold text-red-600" colSpan={headers.length - 2}>
                  {subtotalLabel}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-red-600 tabular-nums">{subtotalAmount.toFixed(2)}</td>
                <td />
              </>
            ) : (
              <>
                <td className="px-3 py-1.5 font-semibold text-red-600" colSpan={headers.length - 1}>
                  {subtotalLabel}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-red-600 tabular-nums">{subtotalAmount.toFixed(2)}</td>
              </>
            )}
            {editing && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
