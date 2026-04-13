/* ============================================================
 * 五金价格表 — 专用导入模板（与「物料价格表 › 五金」一致）
 * 列：类型、图片、名称、单位、浅金/白呖、鎏金价格、备注、同义词、供应商
 * 说明：类型列可合并单元格，导入时对「类型」向下填充。
 * ============================================================ */

import * as XLSX from 'xlsx';
import type { PriceItem } from '@/app/(dashboard)/prices/_components/mockData';
import type { SupplierItem } from '@/app/(dashboard)/suppliers/_components/mockData';

export const HARDWARE_PRICE_IMPORT_FILENAME = '五金导入模板.xlsx';

/** 生成的模板表头（与现有桌面模板一致，便于往返） */
export const HARDWARE_PRICE_TEMPLATE_HEADERS = [
  '类型',
  '图片',
  '名称',
  '单位',
  '浅金/白呖',
  '鎏金价格',
  '备注',
  '同义词',
  '供应商',
] as const;

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .replace(/\s+/g, '')
    .trim();
}

/** 表头别名 → 标准键（与 ParsedHardwareRow 一致） */
const HEADER_ALIASES: Record<string, keyof ParsedHardwareRow | 'skip'> = {
  类型: 'materialType',
  图片: 'imageNote',
  名称: 'name',
  单位: 'unit',
  '浅金/白呖': 'price1',
  浅金白呖: 'price1',
  浅金: 'price1',
  鎏金价格: 'price2',
  鎏金: 'price2',
  备注: 'remark',
  同义词: 'synonyms',
  供应商: 'supplierName',
};

export interface ParsedHardwareRow {
  materialType: string;
  imageNote: string;
  name: string;
  unit: string;
  price1: number | null;
  price2: number | null;
  remark: string;
  synonyms: string;
  supplierName: string;
}

export interface HardwareImportResult {
  rows: ParsedHardwareRow[];
  errors: { row: number; message: string }[];
}

interface ColMapEntry {
  idx: number;
  key: keyof ParsedHardwareRow;
}

export function downloadHardwarePriceImportTemplate(): void {
  const example: (string | number)[] = [
    'TC唛头',
    '',
    'TC唛头草写圆角',
    '个',
    0.86,
    1.1,
    '',
    'TC唛头草字,唛头草字,TC唛圆角',
    '海之洋',
  ];
  const ws = XLSX.utils.aoa_to_sheet([ [...HARDWARE_PRICE_TEMPLATE_HEADERS], example ]);
  ws['!cols'] = HARDWARE_PRICE_TEMPLATE_HEADERS.map((h) => ({
    wch: Math.max(10, String(h).length + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '五金价格');
  XLSX.writeFile(wb, HARDWARE_PRICE_IMPORT_FILENAME);
}

function parsePriceCell(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (s === '' || s === '/' || s === '—' || s === '-' || s === '无') return null;
  const cleaned = s.replace(/[¥￥,\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function buildColumnMap(headerRow: unknown[]): ColMapEntry[] {
  const list: ColMapEntry[] = [];
  headerRow.forEach((cell, i) => {
    const key = HEADER_ALIASES[normalizeHeader(cell)];
    if (!key || key === 'skip') return;
    list.push({ idx: i, key });
  });
  return list;
}

export function parseHardwarePriceWorkbook(buffer: ArrayBuffer): HardwareImportResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  const errors: { row: number; message: string }[] = [];
  if (aoa.length < 2) {
    return { rows: [], errors: [{ row: 0, message: '表格为空或没有数据行' }] };
  }

  const headerRow = aoa[0] ?? [];
  const colMap = buildColumnMap(headerRow);
  const hasName = colMap.some((c) => c.key === 'name');
  const hasUnit = colMap.some((c) => c.key === 'unit');
  if (!hasName) errors.push({ row: 1, message: '未找到「名称」列，请使用五金专用模板表头' });
  if (!hasUnit) errors.push({ row: 1, message: '未找到「单位」列' });
  if (errors.length) return { rows: [], errors };

  let lastType = '';
  const rows: ParsedHardwareRow[] = [];

  for (let r = 1; r < aoa.length; r++) {
    const line = aoa[r] ?? [];
    const cells = [...line];

    const get = (key: keyof ParsedHardwareRow): string => {
      const ent = colMap.find((c) => c.key === key);
      if (!ent) return '';
      const v = cells[ent.idx];
      if (v === null || v === undefined) return '';
      return String(v).trim();
    };

    const typeCell = get('materialType');
    if (typeCell) lastType = typeCell;

    const name = get('name');
    if (!name) continue;

    const p1ent = colMap.find((c) => c.key === 'price1');
    const p2ent = colMap.find((c) => c.key === 'price2');
    const price1 = p1ent ? parsePriceCell(cells[p1ent.idx]) : null;
    const price2 = p2ent ? parsePriceCell(cells[p2ent.idx]) : null;

    const row: ParsedHardwareRow = {
      materialType: lastType || typeCell || name,
      imageNote: get('imageNote'),
      name,
      unit: get('unit') || '个',
      price1,
      price2,
      remark: get('remark'),
      synonyms: get('synonyms'),
      supplierName: get('supplierName'),
    };
    rows.push(row);
  }

  if (rows.length === 0) {
    errors.push({ row: 0, message: '没有有效数据行（请至少填写「名称」）' });
  }

  return { rows, errors };
}

function resolveSupplier(
  suppliers: SupplierItem[],
  supplierName: string,
): { id: string; name: string } | null {
  const t = supplierName.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = suppliers.find(
    (s) =>
      s.type === '物料供应商' &&
      s.category === '五金' &&
      (s.name === t || s.name.toLowerCase() === lower),
  );
  if (hit) return { id: hit.id, name: hit.name };
  const loose = suppliers.find(
    (s) => s.type === '物料供应商' && (s.name === t || s.name.includes(t) || t.includes(s.name)),
  );
  return loose ? { id: loose.id, name: loose.name } : null;
}

const DEFAULT_HARDWARE_SUB = '特殊五金';

export function parsedHardwareRowsToPriceItems(
  parsed: ParsedHardwareRow[],
  suppliers: SupplierItem[],
  options?: { startIndex?: number },
): { items: PriceItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const base = options?.startIndex ?? Date.now();
  const items: PriceItem[] = [];

  parsed.forEach((row, i) => {
    const sup = resolveSupplier(suppliers, row.supplierName);
    if (!sup && row.supplierName) {
      warnings.push(`第 ${i + 2} 行：未找到供应商「${row.supplierName}」，已跳过该行`);
      return;
    }
    if (!sup) {
      warnings.push(`第 ${i + 2} 行：未填写供应商，已跳过`);
      return;
    }

    const code = `IMP-${base}-${String(i + 1).padStart(4, '0')}`;
    const remark = [row.remark, row.imageNote ? `图片:${row.imageNote}` : '']
      .filter(Boolean)
      .join('；');

    const item: PriceItem = {
      id: `price_imp_${base}_${i}`,
      tab: '物料',
      materialType: row.materialType || row.name,
      code,
      name: row.name,
      unit: row.unit,
      category: '五金',
      subCategory: DEFAULT_HARDWARE_SUB,
      spec: '',
      brand: '',
      supplierId: sup.id,
      supplierName: sup.name,
      price1: row.price1,
      price2: row.price2,
      price3: null,
      colorCategory: null,
      synonyms: row.synonyms || null,
      remark,
      status: '有效',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    items.push(item);
  });

  return { items, warnings };
}
