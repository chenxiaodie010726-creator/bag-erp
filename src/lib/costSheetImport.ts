/* ============================================================
 * 成本表 Excel 导入解析器
 * 读取标准模板格式的Excel，解析为CostSheet对象
 * 支持多成本表Sheet格式（做法不同的颜色变体）
 * ============================================================ */

import { generateId, parseWasteRateFromImportCell } from './costSheetUtils';
import { applyHardwarePricesFromColorMap } from './hardwarePriceCatalog';
import type {
  CostSheet,
  CostSheetMaterialItem,
  CostSheetHardwareItem,
  CostSheetPackagingItem,
  CostSheetCraftItem,
  CostSheetOilEdge,
  ColorMaterialMapEntry,
  PackagingDetails,
  ProductionRequirementItem,
} from '@/types';

type Row = (string | number | null | undefined)[];

/** 第 5 行列头 → 列名到列索引（与导出模板一致时可自动识别新旧列序） */
function materialHeaderColMap(sheetRows: Row[]): Map<string, number> | null {
  const h = sheetRows[4];
  if (!h) return null;
  const m = new Map<string, number>();
  h.forEach((cell, i) => {
    const k = String(cell ?? '').trim();
    if (k) m.set(k, i);
  });
  return m.size ? m : null;
}

function colIdx(map: Map<string, number> | null, key: string, def: number): number {
  return map?.has(key) ? map.get(key)! : def;
}

/**
 * 物料区列索引（0-based）。兼容：① 有/无「类别」列；② 有/无「用量」列（导出表多一列）。
 */
function materialColumnIndices(matCol: Map<string, number> | null): {
  hasCategory: boolean;
  part: number;
  length: number;
  width: number;
  pieces: number;
  fabric: number;
  waste: number;
  oil: number;
  glue: number;
  remarks: number;
} {
  const hasCategory = !!matCol?.has('类别');
  const hasUsage = !!matCol?.has('用量');
  const d = !hasUsage
    ? hasCategory
      ? { part: 1, length: 2, width: 3, pieces: 4, fabric: 5, waste: 6, oil: 7, glue: 8, remarks: 9 }
      : { part: 0, length: 1, width: 2, pieces: 3, fabric: 4, waste: 5, oil: 6, glue: 7, remarks: 8 }
    : hasCategory
      ? { part: 1, length: 2, width: 3, pieces: 4, fabric: 5, waste: 7, oil: 11, glue: 12, remarks: 14 }
      : { part: 0, length: 1, width: 2, pieces: 3, fabric: 4, waste: 6, oil: 10, glue: 11, remarks: 13 };

  let waste = colIdx(matCol, '损耗', d.waste);
  if (matCol?.has('损耗') && matCol.has('用量') && matCol.get('损耗')! < matCol.get('用量')!) {
    waste = matCol.get('损耗')!;
  }

  return {
    hasCategory,
    part: colIdx(matCol, '部件名称', d.part),
    length: colIdx(matCol, '长', d.length),
    width: colIdx(matCol, '宽', d.width),
    pieces: colIdx(matCol, '件数', d.pieces),
    fabric: colIdx(matCol, '布幅', d.fabric),
    waste,
    oil: colIdx(matCol, '油边/寸', d.oil),
    glue: colIdx(matCol, '过胶单价', d.glue),
    remarks: colIdx(matCol, '备注', d.remarks),
  };
}

/** 解析成本表Sheet的数据 */
export function parseCostSheetExcel(
  sheetRows: Row[],
  colorMapRows: Row[] | null,
): CostSheet {
  const id = generateId();

  // 读取头部信息
  let patternCode = '';
  let date = '';
  let patternPieces: number | null = null;
  let knifeGap: string | null = null;

  // 第3行：纸格款号、日期、件数、刀缝
  if (sheetRows[2]) {
    const r3 = sheetRows[2];
    patternCode = String(r3[1] ?? '').trim();
    date = String(r3[4] ?? '').trim();
    patternPieces = r3[7] ? Number(r3[7]) : null;
    knifeGap = r3[10] ? String(r3[10]) : null;
  }

  // 解析数据区域（从第6行开始，即index=5）
  const materialItems: CostSheetMaterialItem[] = [];
  const hardwareItems: CostSheetHardwareItem[] = [];
  const packagingItems: CostSheetPackagingItem[] = [];
  const craftItems: CostSheetCraftItem[] = [];
  let oilEdge: CostSheetOilEdge | null = null;

  const matCol = materialHeaderColMap(sheetRows);
  const matCols = materialColumnIndices(matCol);

  let currentSection: 'material' | 'hardware' | 'packaging' | 'craft' | 'oil_edge' | null = 'material';
  let currentCategory = matCols.hasCategory ? '' : '主料';
  let materialOrder = 0;
  let hwOrder = 0;
  let pkgOrder = 0;
  let craftOrder = 0;

  for (let i = 5; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.every((c) => c === null || c === undefined || c === '')) continue;

    const cellA = String(row[0] ?? '').trim();

    // 检测区域标题
    if (cellA.startsWith('【五金】')) { currentSection = 'hardware'; continue; }
    if (cellA.startsWith('【包装】')) { currentSection = 'packaging'; continue; }
    if (cellA.startsWith('【工艺】')) { currentSection = 'craft'; continue; }
    if (cellA.startsWith('【油边】')) { currentSection = 'oil_edge'; continue; }

    // 跳过列头行和小计行
    if (cellA === '类别' || cellA === '编号' || cellA === '' && String(row[1] ?? '').trim() === '名称') continue;
    if (cellA === '部件名称' || cellA === '名称') continue;
    // 五金区列头（新模板：合并 A:B 编号、C:E 名称、F 数量、G 单价；旧：B 图片 + C–F）
    const b1 = String(row[1] ?? '').trim();
    const c2 = String(row[2] ?? '').trim();
    const d4 = String(row[3] ?? '').trim();
    if ((b1 === '图片' && d4 === '名称') || (!cellA && b1 === '名称')) continue;
    if (currentSection === 'hardware' && (c2 === '名称' || (!cellA && b1 === '编号'))) continue;
    // 工艺区列头（新：B图片 C编号 D名称；旧：A编号 B名称）
    if (!cellA && b1 === '图片' && String(row[3] ?? '').trim() === '名称') continue;
    if (cellA.includes('小计') || cellA.includes('总计') || cellA.includes('物料小计')) continue;
    if (String(row[0] ?? '').trim() === '总长(寸)' || String(row[1] ?? '').trim() === '总长(寸)') continue; // 油边列头

    // 解析物料区域
    if (currentSection === 'material') {
      if (matCols.hasCategory && cellA && !cellA.includes('小计')) {
        currentCategory = cellA;
      }

      const partName = String(row[matCols.part] ?? '').trim();
      if (!partName) continue;

      const length = Number(row[matCols.length]) || 0;
      const width = row[matCols.width] ? Number(row[matCols.width]) : null;
      const pieces = Number(row[matCols.pieces]) || 1;
      const fabricWidth = row[matCols.fabric] ? Number(row[matCols.fabric]) : null;
      const wasteRate = parseWasteRateFromImportCell(row[matCols.waste]);
      const oilEdgeInches = row[matCols.oil] ? Number(row[matCols.oil]) : null;
      const gluePrice = row[matCols.glue] ? Number(row[matCols.glue]) : null;

      materialItems.push({
        id: generateId(),
        cost_sheet_id: id,
        category: currentCategory || '主料',
        part_name: partName,
        length,
        width,
        pieces,
        fabric_width: fabricWidth,
        waste_rate: wasteRate,
        material_code: null,
        unit_price: null, // 导入时忽略，系统自动匹配
        oil_edge_inches: oilEdgeInches,
        glue_price: gluePrice,
        remarks:
          row[matCols.remarks] != null && String(row[matCols.remarks]).trim() !== ''
            ? String(row[matCols.remarks]).trim()
            : null,
        sort_order: materialOrder++,
      });
    }

    // 解析五金：
    // ① 桌面模板（五列紧邻）：名称 | 编号 | 数量 | 单价 | 备注
    // ② 旧合并模板：A:B=编号，C:E=名称，F=数量，G=单价…
    // ③ 旧：B=图片URL C=编号 D=名称 E=数量 F=单价
    // ④ 更旧：B=名称 C=数量 D=单价
    if (currentSection === 'hardware') {
      const imgCell = String(row[1] ?? '').trim();
      const bIsUrl = /^https?:\/\//i.test(imgCell);

      const numCell = (x: unknown) => {
        if (x === '' || x === null || x === undefined) return NaN;
        const n = Number(x);
        return Number.isFinite(n) ? n : NaN;
      };

      const qc = numCell(row[2]);
      const pc = numCell(row[3]);
      const h0 = String(row[0] ?? '').trim();
      const h1 = String(row[1] ?? '').trim();
      if (
        h0 &&
        !bIsUrl &&
        Number.isFinite(qc) &&
        Number.isFinite(pc) &&
        qc >= 0 &&
        pc >= 0
      ) {
        hardwareItems.push({
          id: generateId(),
          cost_sheet_id: id,
          material_code: h1 || null,
          image_url: null,
          name: h0,
          quantity: qc,
          unit_price: pc,
          sort_order: hwOrder++,
        });
        continue;
      }

      const nameInCDE =
        String(row[3] ?? '').trim() ||
        String(row[2] ?? '').trim() ||
        String(row[4] ?? '').trim();
      const nameOldWide = String(row[3] ?? '').trim();
      const nameOld = String(row[1] ?? '').trim();

      let name: string;
      let image_url: string | null = null;
      let material_code: string | null = null;
      let qty: number;
      let price: number;

      const qOldE = numCell(row[4]);
      const pOldF = numCell(row[5]);
      const qNewF = numCell(row[5]);
      const pNewG = numCell(row[6]);

      const gEmpty =
        row[6] === undefined || row[6] === null || String(row[6]).trim() === '';

      // 旧宽表：D=名称，E/F=数量、单价；G 列无单价（新模板单价在 G）
      const oldWide =
        Boolean(nameOldWide) &&
        Number.isFinite(qOldE) &&
        Number.isFinite(pOldF) &&
        gEmpty;

      // 新表：名称在 C–E，数量/单价在 F/G
      const newTemplate =
        !bIsUrl &&
        Boolean(nameInCDE) &&
        Number.isFinite(qNewF) &&
        Number.isFinite(pNewG) &&
        !oldWide;

      if (newTemplate) {
        name = nameInCDE;
        material_code = String(row[0] ?? '').trim() || null;
        qty = qNewF;
        price = pNewG;
        image_url = null;
      } else if (nameOldWide && (bIsUrl || oldWide || String(row[2] ?? '').trim())) {
        name = nameOldWide;
        image_url = bIsUrl ? imgCell : null;
        material_code = String(row[2] ?? '').trim() || null;
        qty = Number(row[4]) || 0;
        price = Number(row[5]) || 0;
      } else if (nameOld && !bIsUrl) {
        name = nameOld;
        qty = Number(row[2]) || 0;
        price = Number(row[3]) || 0;
        image_url = null;
        material_code = null;
      } else continue;

      hardwareItems.push({
        id: generateId(),
        cost_sheet_id: id,
        material_code,
        image_url,
        name,
        quantity: qty,
        unit_price: price,
        sort_order: hwOrder++,
      });
    }

    // 解析包装
    if (currentSection === 'packaging') {
      const name = String(row[1] ?? '').trim();
      if (!name) continue;
      const code = String(row[0] ?? '').trim() || null;
      const qty = row[2] ? Number(row[2]) : null;
      const price = row[3] ? Number(row[3]) : null;
      const isAutoCalc = !qty || String(row[14] ?? row[13] ?? '').includes('自动');

      packagingItems.push({
        id: generateId(),
        cost_sheet_id: id,
        code,
        name,
        quantity: qty,
        unit_price: price,
        is_auto_calc: isAutoCalc,
        sort_order: pkgOrder++,
      });
    }

    // 解析工艺：五列紧邻 编号|名称|数量|单价|备注；或旧 B图片 C编号 D名称 E数量 F单价；或 A编号 B名称…
    if (currentSection === 'craft') {
      const c0 = String(row[0] ?? '').trim();
      const c1 = String(row[1] ?? '').trim();
      const nameNew = String(row[3] ?? '').trim();
      const nameOld = String(row[1] ?? '').trim();
      let name: string;
      let image_url: string | null = null;
      let code: string;
      let qty: number;
      let price: number;
      if (
        c0 &&
        c1 &&
        !/^https?:\/\//i.test(c1) &&
        Number.isFinite(Number(row[2])) &&
        Number.isFinite(Number(row[3]))
      ) {
        name = c1;
        code = c0;
        qty = Number(row[2]) || 1;
        price = Number(row[3]) || 0;
        image_url = null;
        const isPatternBound = code.includes('填款号') || code === patternCode;
        craftItems.push({
          id: generateId(),
          cost_sheet_id: id,
          image_url,
          code: isPatternBound ? patternCode : code,
          name,
          quantity: qty,
          unit_price: price,
          is_pattern_bound: isPatternBound,
          sort_order: craftOrder++,
        });
        continue;
      }
      if (nameNew) {
        name = nameNew;
        const imgCell = String(row[1] ?? '').trim();
        image_url = /^https?:\/\//i.test(imgCell) ? imgCell : null;
        code = String(row[2] ?? '').trim();
        qty = Number(row[4]) || 1;
        price = Number(row[5]) || 0;
      } else if (nameOld) {
        name = nameOld;
        code = String(row[0] ?? '').trim();
        qty = Number(row[2]) || 1;
        price = Number(row[3]) || 0;
      } else continue;

      const isPatternBound = code.includes('填款号') || code === patternCode;

      craftItems.push({
        id: generateId(),
        cost_sheet_id: id,
        image_url,
        code: isPatternBound ? patternCode : code,
        name,
        quantity: qty,
        unit_price: price,
        is_pattern_bound: isPatternBound,
        sort_order: craftOrder++,
      });
    }

    // 解析油边：新模板 A总长 B数量 C单价 D备注；旧模板 A空 B总长 C数量 D单价
    if (currentSection === 'oil_edge') {
      const n = (x: unknown) => {
        if (x === '' || x === null || x === undefined) return NaN;
        const v = Number(x);
        return Number.isFinite(v) ? v : NaN;
      };
      let totalLen = Number(row[0]) || 0;
      let qty = Number(row[1]) || 1;
      let price = n(row[2]);
      if (!(totalLen > 0)) {
        totalLen = Number(row[1]) || 0;
        qty = Number(row[2]) || 1;
        price = n(row[3]);
      }
      if (!Number.isFinite(price) || price <= 0) price = 0.01;
      if (totalLen > 0) {
        oilEdge = {
          id: generateId(),
          cost_sheet_id: id,
          total_length_inches: totalLen,
          quantity: qty,
          unit_price: price,
        };
      }
    }
  }

  // 解析颜色物料对照表
  let colorMaterialMap: ColorMaterialMapEntry[] = [];
  if (colorMapRows && colorMapRows.length > 0) {
    // 第5行(index=4)是列头
    const headerRow = colorMapRows[4];
    const headers: string[] = [];
    if (headerRow) {
      for (let c = 2; c < headerRow.length; c++) {
        headers.push(String(headerRow[c] ?? '').trim());
      }
    }

    for (let i = 5; i < colorMapRows.length; i++) {
      const row = colorMapRows[i];
      if (!row) continue;
      const colorZh = String(row[0] ?? '').trim();
      if (!colorZh || colorZh.startsWith('填写') || colorZh.startsWith('•')) break;

      const colorEn = String(row[1] ?? '').trim();
      const mappings: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) {
        const val = String(row[c + 2] ?? '').trim();
        if (val && headers[c]) {
          mappings[headers[c]] = val;
        }
      }

      colorMaterialMap.push({
        id: generateId(),
        cost_sheet_id: id,
        color_zh: colorZh,
        color_en: colorEn,
        mappings,
      });
    }
  }

  return {
    id,
    pattern_code: patternCode,
    version: 1,
    status: 'draft',
    date,
    pattern_pieces: patternPieces,
    knife_gap: knifeGap,
    notes: null,
    created_at: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString().slice(0, 10),
    material_items: materialItems,
    hardware_items: applyHardwarePricesFromColorMap(hardwareItems, colorMaterialMap),
    packaging_items: packagingItems,
    craft_items: craftItems,
    oil_edge: oilEdge,
    color_material_map: colorMaterialMap,
  };
}

// ============================================================
// 多成本表 Sheet 格式解析（新格式）
// ============================================================

/** 从成本表 Sheet 名称提取变体标识（去掉括号和"成本表"前缀） */
export function extractVariantKeyFromSheetName(name: string): string {
  // 匹配 "成本表(xxx)" / "成本表（xxx）" / "成本表 xxx"
  const m = name.trim().match(/成本表[\s(（]+([^)）]+)[)）]?/);
  if (m) {
    const label = m[1].trim();
    return label;
  }
  return name.trim();
}

/** 判断 Sheet 名称是否为基准成本表（常规/默认）*/
export function isBaseSheetName(name: string): boolean {
  const key = extractVariantKeyFromSheetName(name);
  return key === '常规' || key === name.trim() || name.trim() === '成本表';
}

/** 仅解析成本表 Sheet 的物料区（供变体比对使用），返回 CostSheetMaterialItem[] */
function parseMaterialOnly(sheetRows: Row[], costSheetId: string): CostSheetMaterialItem[] {
  const items: CostSheetMaterialItem[] = [];
  const matCol = materialHeaderColMap(sheetRows);
  const matCols = materialColumnIndices(matCol);

  let currentCategory = matCols.hasCategory ? '' : '主料';
  let order = 0;

  for (let i = 5; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.every((c) => c === null || c === undefined || c === '')) continue;
    const cellA = String(row[0] ?? '').trim();
    // 遇到五金/包装等区域标题则停止
    if (cellA.startsWith('【')) break;
    if (cellA === '类别' || cellA === '部件名称') continue;
    if (cellA.includes('小计') || cellA.includes('总计') || cellA.includes('物料小计')) continue;

    if (matCols.hasCategory && cellA && !cellA.includes('小计')) currentCategory = cellA;

    const partName = String(row[matCols.part] ?? '').trim();
    if (!partName) continue;

    items.push({
      id: generateId(),
      cost_sheet_id: costSheetId,
      category: currentCategory || '主料',
      part_name: partName,
      length: Number(row[matCols.length]) || 0,
      width: row[matCols.width] ? Number(row[matCols.width]) : null,
      pieces: Number(row[matCols.pieces]) || 1,
      fabric_width: row[matCols.fabric] ? Number(row[matCols.fabric]) : null,
      waste_rate: parseWasteRateFromImportCell(row[matCols.waste]),
      material_code: null,
      unit_price: null,
      oil_edge_inches: row[matCols.oil] ? Number(row[matCols.oil]) : null,
      glue_price: row[matCols.glue] ? Number(row[matCols.glue]) : null,
      remarks:
        row[matCols.remarks] != null && String(row[matCols.remarks]).trim() !== ''
          ? String(row[matCols.remarks]).trim()
          : null,
      sort_order: order++,
    });
  }
  return items;
}

/** 解析颜色物料对照表（新格式，含「成本表引用」列） */
function parseColorMapWithRef(colorMapRows: Row[], costSheetId: string): ColorMaterialMapEntry[] {
  const entries: ColorMaterialMapEntry[] = [];
  const headerRow = colorMapRows[4];
  if (!headerRow) return entries;

  // 从 C 列开始收集列头（A=颜色中文, B=颜色英文, C+...=物料列和成本表引用列）
  const headers: string[] = [];
  for (let c = 2; c < headerRow.length; c++) {
    headers.push(String(headerRow[c] ?? '').trim());
  }

  // 找「成本表引用」列的索引（在 headers 数组中的位置，对应 Excel 列 = c+2）
  const refColInHeaders = headers.findIndex(
    (h) => h === '成本表引用' || h === '成本表引用'
  );

  for (let i = 5; i < colorMapRows.length; i++) {
    const row = colorMapRows[i];
    if (!row) continue;
    const colorZh = String(row[0] ?? '').trim();
    if (!colorZh || colorZh.startsWith('填写') || colorZh.startsWith('•')) break;

    const colorEn = String(row[1] ?? '').trim();
    const mappings: Record<string, string> = {};
    let costSheetRef: string | undefined;

    for (let c = 0; c < headers.length; c++) {
      const val = String(row[c + 2] ?? '').trim();
      if (headers[c] === '成本表引用') {
        if (val) costSheetRef = val;
      } else if (val && headers[c]) {
        mappings[headers[c]] = val;
      }
    }

    entries.push({
      id: generateId(),
      cost_sheet_id: costSheetId,
      color_zh: colorZh,
      color_en: colorEn,
      mappings,
      ...(costSheetRef ? { cost_sheet_ref: costSheetRef } : {}),
    });
  }

  // 兼容旧格式（无「成本表引用」列）：如果没有找到该列，返回 entries 原样
  void refColInHeaders;
  return entries;
}

/** 解析「包装材料」Sheet */
function parsePackagingDetails(rows: Row[]): PackagingDetails {
  const details: PackagingDetails = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cellA = String(row[0] ?? '').trim();
    const cellB = String(row[1] ?? '').trim();

    // 识别区块标题行，然后读取接下来的列头行和数据行
    if (cellA === '布袋' || cellA.startsWith('布袋')) {
      // 下一行是列头，再下一行是数据
      const dataRow = rows[i + 2];
      if (dataRow) {
        details.cloth_bag_logo_position = String(dataRow[0] ?? '').trim() || undefined;
        details.cloth_bag_logo_type = String(dataRow[1] ?? '').trim() || undefined;
        details.cloth_bag_size = String(dataRow[2] ?? '').trim() || undefined;
        details.cloth_bag_wrist_height = String(dataRow[3] ?? '').trim() || undefined;
        details.plastic_bag_size = String(dataRow[4] ?? dataRow[5] ?? '').trim() || undefined;
      }
    } else if (cellA === '贴纸' || cellA.startsWith('贴纸')) {
      const dataRow = rows[i + 2];
      if (dataRow) {
        const v0 = dataRow[0]; const v1 = dataRow[1]; const v2 = dataRow[2];
        if (v0 !== null && v0 !== undefined && v0 !== '') details.tag_sticker_qty = Number(v0) || undefined;
        if (v1 !== null && v1 !== undefined && v1 !== '') details.tape_sticker_qty = Number(v1) || undefined;
        if (v2 !== null && v2 !== undefined && v2 !== '') details.carton_sticker_note = String(v2).trim() || undefined;
      }
    } else if (cellA === '洗水唛' || cellA.startsWith('洗水唛')) {
      const dataRow = rows[i + 2];
      if (dataRow) {
        details.wash_label_po = String(dataRow[0] ?? '').trim() || undefined;
        details.wash_label_size = String(dataRow[1] ?? '').trim() || undefined;
      }
    } else if (cellA === '纸箱' || cellA.startsWith('纸箱')) {
      const dataRow = rows[i + 2];
      if (dataRow) {
        details.carton_size = String(dataRow[0] ?? '').trim() || undefined;
        details.carton_qty_per_box = String(dataRow[1] ?? '').trim() || undefined;
      }
    } else if (cellA === '包装信息' || cellA.startsWith('包装信息')) {
      const dataRow = rows[i + 2];
      if (dataRow) {
        details.package_size = String(dataRow[0] ?? '').trim() || undefined;
        const wVal = dataRow[1];
        if (wVal !== null && wVal !== undefined && wVal !== '') details.package_weight_kg = Number(wVal) || undefined;
      }
    } else if (cellB === 'LOGO位置') {
      // 旧格式：该行即列头，下一行是数据
      const dataRow = rows[i + 1];
      if (dataRow) {
        details.cloth_bag_logo_position = String(dataRow[1] ?? '').trim() || undefined;
        details.cloth_bag_logo_type = String(dataRow[2] ?? '').trim() || undefined;
        details.cloth_bag_size = String(dataRow[3] ?? '').trim() || undefined;
      }
    }
  }
  return details;
}

function isProductionTitleRow(a: string): boolean {
  return /^生产要求\s*$/.test(a.trim()) || a.trim() === '生产要求';
}

function isProductionInstructionRow(a: string): boolean {
  return a.trim().startsWith('【说明】') || a.trim().startsWith('【说明');
}

/** 表头行：要求项 / 具体要求 等 */
function isProductionColumnHeaderRow(a: string, b: string): boolean {
  const A = a.trim();
  const B = b.trim();
  if (!A && !B) return false;
  return (
    (/^(要求项|类别|项目|标签)/.test(A) && /(具体|内容|详细|说明)/.test(B)) ||
    (A.includes('左列') && B.includes('右列')) ||
    (/^要求项/.test(A) && /^具体/.test(B))
  );
}

/** 解析「生产要求」Sheet：两列自由行，左列非空为新的一条；左列空且右列有内容则续接到上一条 */
export function parseProductionRequirements(rows: Row[]): ProductionRequirementItem[] {
  const items: ProductionRequirementItem[] = [];
  let sortOrder = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null || c === undefined || c === '')) continue;
    const rawA = String(row[0] ?? '').replace(/\r\n/g, '\n').trim();
    const rawBFull = String(row[1] ?? '').replace(/\r\n/g, '\n');
    const rawB = rawBFull.trim();

    if (isProductionTitleRow(rawA) && !rawB) continue;
    if (isProductionInstructionRow(rawA)) continue;
    if (isProductionColumnHeaderRow(rawA, rawB)) continue;

    if (!rawA && rawB && items.length > 0) {
      const prev = items[items.length - 1];
      prev.content = prev.content ? `${prev.content}\n${rawB}` : rawB;
      continue;
    }
    if (!rawA) continue;

    items.push({
      id: generateId(),
      label: rawA,
      content: rawB,
      sort_order: sortOrder++,
    });
  }
  return items;
}

/** 多成本表 Sheet 格式的统一入口
 *
 * sheets 数组每个元素为 { name: Sheet名, rows: 二维单元格数组 }
 * 识别规则：
 *   - 名称以「成本表」开头 → 成本表 Sheet（可多个）
 *   - 名称为「颜色物料对照表」或含「颜色」「对照」 → 颜色对照表
 *   - 名称为「包装材料」或含「包装」 → 包装材料
 *   - 名称为「生产要求」或含「生产要求」 → 生产要求（两列自由行）
 */
export function parseMultiSheetCostSheetExcel(
  sheets: { name: string; rows: Row[] }[]
): CostSheet {
  // 分类各 Sheet
  const costSheets: { name: string; rows: Row[] }[] = [];
  let colorMapSheet: { name: string; rows: Row[] } | null = null;
  let packagingSheet: { name: string; rows: Row[] } | null = null;
  let productionReqSheet: { name: string; rows: Row[] } | null = null;

  for (const s of sheets) {
    const n = s.name.trim();
    if (n.startsWith('成本表')) {
      costSheets.push(s);
    } else if (n === '颜色物料对照表' || (n.includes('颜色') && n.includes('对照'))) {
      colorMapSheet = s;
    } else if (n === '包装材料' || n.includes('包装材料')) {
      packagingSheet = s;
    } else if (n === '生产要求' || n.includes('生产要求')) {
      productionReqSheet = s;
    }
  }

  // 确定基准成本表（优先找"成本表(常规)"或"成本表"，否则取第一个）
  const baseSheet =
    costSheets.find((s) => isBaseSheetName(s.name)) ??
    costSheets[0];

  if (!baseSheet) {
    // 兼容旧格式：直接把第一个 Sheet 当成本表，第二个当颜色对照表
    const fallbackColorRows = !colorMapSheet && sheets.length >= 2 ? sheets[1].rows : null;
    return parseCostSheetExcel(
      sheets[0]?.rows ?? [],
      fallbackColorRows,
    );
  }

  // 解析基准成本表
  const base = parseCostSheetExcel(
    baseSheet.rows,
    colorMapSheet ? null : (sheets.find((s) => s !== baseSheet)?.rows ?? null),
  );

  // 解析颜色对照表（含成本表引用列）
  if (colorMapSheet) {
    base.color_material_map = parseColorMapWithRef(colorMapSheet.rows, base.id);
  }

  // 解析「做法不同」变体成本表
  const variantFull: Record<string, CostSheetMaterialItem[]> = {};
  const variantType: Record<string, 'price_diff' | 'method_diff'> = {};

  for (const vs of costSheets) {
    if (vs === baseSheet) continue;
    const variantKey = extractVariantKeyFromSheetName(vs.name);
    if (!variantKey || variantKey === '常规') continue;
    const items = parseMaterialOnly(vs.rows, base.id);
    if (items.length > 0) {
      variantFull[variantKey] = items;
      variantType[variantKey] = 'method_diff';
    }
  }

  if (Object.keys(variantFull).length > 0) {
    base.material_variant_full = variantFull;
    base.material_variant_type = variantType;
  }

  // 解析包装材料
  if (packagingSheet) {
    base.packaging_details = parsePackagingDetails(packagingSheet.rows);
  }

  // 解析生产要求
  if (productionReqSheet) {
    const pr = parseProductionRequirements(productionReqSheet.rows);
    base.production_requirements = pr.length > 0 ? pr : undefined;
  }

  return base;
}
