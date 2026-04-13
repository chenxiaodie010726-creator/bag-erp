/* ============================================================
 * 成本表 Excel 导出
 * 导出带格式的Excel，与导入模板共用同一格式
 * ============================================================ */

import type { CostSheet } from '@/types';
import { groupMaterialsByCategory, loadLaborCosts } from './costSheetUtils';

/** 主表「成本表」Sheet 物料区及下方各块统一列数（A–O） */
const MAIN_COLS = 15;

// 颜色常量
const COLORS = {
  darkHeader: '333333',
  /** 油边/过胶/备注 等可选列头（浅底深字，与导入模板一致） */
  optionalHeaderBg: 'D8DCE3',
  optionalHeaderFg: '333333',
  mainBg: 'FFF2CC',
  subBg: 'D9EAD3',
  liningBg: 'CFE2F3',
  auxBg: 'F4CCCC',
  zipBg: 'D9D2E9',
  hwBg: 'FCE5CD',
  pkgBg: 'EAD1DC',
  craftBg: 'C9DAF8',
  oilBg: 'FFEEB3',
  subtotalBg: 'F0F0F0',
  totalBg: 'FFFF00',
  white: 'FFFFFF',
  red: 'CC0000',
  green: '008800',
};

function getCategoryColor(cat: string): string {
  if (cat === '主料') return COLORS.mainBg;
  if (cat === '配料') return COLORS.subBg;
  if (cat === '里布') return COLORS.liningBg;
  if (cat.includes('辅料')) return COLORS.auxBg;
  if (cat.includes('拉链') || cat.includes('织带')) return COLORS.zipBg;
  return 'E8E8E8';
}

export async function exportCostSheetExcel(sheet: CostSheet) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('成本表');

  const thinBorder: Partial<import('exceljs').Borders> = {
    top: { style: 'thin', color: { argb: 'CCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
    left: { style: 'thin', color: { argb: 'CCCCCC' } },
    right: { style: 'thin', color: { argb: 'CCCCCC' } },
  };

  const thickBorder: Partial<import('exceljs').Borders> = {
    top: { style: 'medium', color: { argb: '999999' } },
    bottom: { style: 'medium', color: { argb: '999999' } },
    left: { style: 'thin', color: { argb: 'CCCCCC' } },
    right: { style: 'thin', color: { argb: 'CCCCCC' } },
  };

  const oilEdgeSnapshot = sheet.oil_edge;

  // ---- 标题 ----
  ws.mergeCells('A1:O1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '晟砜皮具 - 成本核算表';
  titleCell.font = { bold: true, size: 13, name: 'Arial' };
  titleCell.alignment = { horizontal: 'center' };

  ws.mergeCells('A2:O2');
  const descCell = ws.getCell('A2');
  descCell.value = `单位：皮=码, 料=码, 纸=张, 油边=寸 | 用量=长×宽×件数÷布幅÷36`;
  descCell.font = { size: 9, name: 'Arial', color: { argb: '888888' }, italic: true };

  // 信息行
  ws.getCell('A3').value = '纸格款号：'; ws.getCell('A3').font = { bold: true, name: 'Arial', size: 10 };
  ws.getCell('B3').value = sheet.pattern_code; ws.getCell('B3').font = { bold: true, size: 11, name: 'Arial', color: { argb: '0000FF' } };
  ws.getCell('E3').value = '日期：'; ws.getCell('E3').font = { bold: true, name: 'Arial', size: 10 };
  ws.getCell('F3').value = sheet.date ?? '';
  ws.getCell('H3').value = '纸格件数：'; ws.getCell('H3').font = { bold: true, name: 'Arial', size: 10 };
  ws.getCell('I3').value = sheet.pattern_pieces ?? '';
  ws.getCell('K3').value = '刀缝：'; ws.getCell('K3').font = { bold: true, name: 'Arial', size: 10 };
  ws.getCell('L3').value = sheet.knife_gap ?? '';

  // ---- 物料列头 (row 5) ----
  const headers = ['类别','部件名称','长','宽','件数','布幅','用量','损耗','总用量','单价','小计金额','油边/寸','过胶单价','过胶金额','备注'];
  const headerRow = ws.getRow(5);
  const optionalMatHeaderIdx = new Set([11, 12, 13, 14]); // 油边/寸、过胶单价、过胶金额、备注
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    const isOpt = optionalMatHeaderIdx.has(i);
    cell.font = {
      bold: true,
      color: { argb: isOpt ? COLORS.optionalHeaderFg : COLORS.white },
      size: 10,
      name: 'Arial',
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isOpt ? COLORS.optionalHeaderBg : COLORS.darkHeader },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // ---- 物料数据 ----
  const materialGroups = groupMaterialsByCategory(sheet.material_items ?? []);
  let r = 6;
  /** 各类别「小计」所在行号，用于「物料小计」行写公式引用 */
  const categorySubtotalRows: number[] = [];

  /** 与 costSheetUtils 一致：有宽且布幅>0 时 长×宽×件÷布幅÷36，否则 长÷36×件数 */
  function materialUsageFormula(rowNum: number): string {
    return `IF(AND(D${rowNum}>0,F${rowNum}>0),C${rowNum}*D${rowNum}*E${rowNum}/F${rowNum}/36,C${rowNum}/36*E${rowNum})`;
  }

  for (const [category, items] of materialGroups.entries()) {
    const startR = r;
    const catColor = getCategoryColor(category);

    for (const item of items) {
      const row = ws.getRow(r);
      row.getCell(1).value = '';
      row.getCell(2).value = item.part_name;
      row.getCell(3).value = item.length;
      row.getCell(4).value = item.width;
      row.getCell(5).value = item.pieces;
      row.getCell(6).value = item.fabric_width;
      row.getCell(7).value = { formula: materialUsageFormula(r) };
      row.getCell(8).value = item.waste_rate;
      row.getCell(8).numFmt = '0.00%';
      row.getCell(9).value = { formula: `G${r}*(1+H${r})` };
      row.getCell(10).value = item.unit_price;
      row.getCell(11).value = { formula: `I${r}*J${r}` };
      row.getCell(12).value = item.oil_edge_inches;
      row.getCell(13).value = item.glue_price;
      row.getCell(14).value = { formula: `I${r}*M${r}` };
      row.getCell(15).value = item.remarks ?? '';

      for (let ci = 0; ci < MAIN_COLS; ci++) {
        const cell = row.getCell(ci + 1);
        cell.font = { size: 10, name: 'Arial' };
        cell.alignment = { horizontal: ci > 1 ? 'center' : 'left', vertical: 'middle' };
        cell.border = thinBorder;
        if (ci === 9) cell.font = { size: 10, name: 'Arial', color: { argb: COLORS.green } };
        if (ci === 10) cell.font = { size: 10, name: 'Arial', color: { argb: COLORS.red }, bold: true };
        if (ci === 11) cell.font = { size: 10, name: 'Arial', color: { argb: COLORS.red }, bold: true };
      }
      r++;
    }

    const endR = r - 1;
    // 合并类别
    if (endR > startR) ws.mergeCells(startR, 1, endR, 1);
    const catCell = ws.getCell(startR, 1);
    catCell.value = category;
    catCell.font = { bold: true, size: 10, name: 'Arial' };
    catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: catColor } };
    catCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    catCell.border = thinBorder;

    // 小计行：G/I/K 为 SUM；M 过胶单价留空供手填；N 过胶金额 = 总用量小计(I 列) × 本行过胶单价(M 列)
    const subRow = ws.getRow(r);
    subRow.getCell(1).value = '小计';
    subRow.getCell(1).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
    subRow.getCell(7).value = { formula: `SUM(G${startR}:G${endR})` };
    subRow.getCell(7).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
    subRow.getCell(7).alignment = { horizontal: 'right' };
    subRow.getCell(9).value = { formula: `SUM(I${startR}:I${endR})` };
    subRow.getCell(9).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
    subRow.getCell(9).alignment = { horizontal: 'right' };
    subRow.getCell(11).value = { formula: `SUM(K${startR}:K${endR})` };
    subRow.getCell(11).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
    subRow.getCell(13).value = null;
    subRow.getCell(13).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
    subRow.getCell(13).alignment = { horizontal: 'right' };
    subRow.getCell(14).value = { formula: `I${r}*M${r}` };
    subRow.getCell(14).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
    subRow.getCell(14).alignment = { horizontal: 'right' };
    categorySubtotalRows.push(r);
    for (let c = 1; c <= MAIN_COLS; c++) {
      subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
      subRow.getCell(c).border = thickBorder;
    }
    r++;
  }

  // 物料小计行：引用各类别小计的 K、N（亦为公式，改明细后联动）
  const materialGrandRow = r;
  const matSubRow = ws.getRow(r);
  matSubRow.getCell(1).value = '物料小计';
  matSubRow.getCell(1).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
  if (categorySubtotalRows.length === 0) {
    matSubRow.getCell(11).value = 0;
    matSubRow.getCell(14).value = 0;
  } else if (categorySubtotalRows.length === 1) {
    const sr = categorySubtotalRows[0];
    matSubRow.getCell(11).value = { formula: `K${sr}` };
    matSubRow.getCell(14).value = { formula: `N${sr}` };
  } else {
    matSubRow.getCell(11).value = { formula: categorySubtotalRows.map((sr) => `K${sr}`).join('+') };
    matSubRow.getCell(14).value = { formula: categorySubtotalRows.map((sr) => `N${sr}`).join('+') };
  }
  matSubRow.getCell(11).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
  matSubRow.getCell(14).font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.red } };
  matSubRow.getCell(14).alignment = { horizontal: 'right' };
  for (let c = 1; c <= MAIN_COLS; c++) {
    matSubRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDDDDD' } };
    matSubRow.getCell(c).border = thickBorder;
  }
  r += 2;

  // ---- 五金 ----
  ws.mergeCells(r, 1, r, MAIN_COLS);
  ws.getCell(r, 1).value = '【五金】';
  ws.getCell(r, 1).font = { bold: true, size: 10, name: 'Arial' };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.hwBg } };
  r++;

  ['', '图片', '编号', '名称', '数量', '单价', '金额', '', '', '', '', '', '', '', '备注'].forEach((h, ci) => {
    const cell = ws.getCell(r, ci + 1);
    cell.value = h || null;
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10, name: 'Arial' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.darkHeader } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center' };
  });
  r++;

  const hwFirstRow = r;
  for (const item of sheet.hardware_items ?? []) {
    ws.getCell(r, 2).value = item.image_url ?? '';
    ws.getCell(r, 2).alignment = { horizontal: 'left' };
    ws.getCell(r, 3).value = item.material_code ?? '';
    ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 4).value = item.name;
    ws.getCell(r, 4).alignment = { horizontal: 'left' };
    ws.getCell(r, 5).value = item.quantity;
    ws.getCell(r, 5).alignment = { horizontal: 'center' };
    ws.getCell(r, 6).value = item.unit_price;
    ws.getCell(r, 6).alignment = { horizontal: 'center' };
    ws.getCell(r, 7).value = { formula: `E${r}*F${r}` };
    ws.getCell(r, 7).alignment = { horizontal: 'center' };
    for (let c = 1; c <= MAIN_COLS; c++) { ws.getCell(r, c).border = thinBorder; ws.getCell(r, c).font = { size: 10, name: 'Arial' }; }
    r++;
  }
  const hwLastRow = r - 1;
  // 五金小计（金额列 G=7）
  const hwSubRow = r;
  ws.getCell(r, 1).value = '五金小计';
  ws.getCell(r, 1).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  ws.getCell(r, 7).value =
    hwLastRow >= hwFirstRow
      ? { formula: `SUM(G${hwFirstRow}:G${hwLastRow})` }
      : 0;
  ws.getCell(r, 7).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  for (let c = 1; c <= MAIN_COLS; c++) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
    ws.getCell(r, c).border = thickBorder;
  }
  r += 2;

  // ---- 包装 ----
  ws.mergeCells(r, 1, r, MAIN_COLS);
  ws.getCell(r, 1).value = '【包装】';
  ws.getCell(r, 1).font = { bold: true, size: 10, name: 'Arial' };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.pkgBg } };
  r++;

  ['编号', '名称', '数量', '单价', '金额', '', '', '', '', '', '', '', '', '', '备注'].forEach((h, ci) => {
    const cell = ws.getCell(r, ci + 1);
    cell.value = h || null;
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10, name: 'Arial' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.darkHeader } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center' };
  });
  r++;

  const pkgFirstRow = r;
  for (const item of sheet.packaging_items ?? []) {
    ws.getCell(r, 1).value = item.code; ws.getCell(r, 1).alignment = { horizontal: 'center' };
    ws.getCell(r, 2).value = item.name; ws.getCell(r, 2).alignment = { horizontal: 'left' };
    ws.getCell(r, 3).value = item.quantity; ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 4).value = item.unit_price; ws.getCell(r, 4).alignment = { horizontal: 'center' };
    ws.getCell(r, 5).value = { formula: `C${r}*D${r}` };
    ws.getCell(r, 5).alignment = { horizontal: 'center' };
    if (item.is_auto_calc) {
      ws.getCell(r, 15).value = '系统根据装箱数自动算';
      ws.getCell(r, 15).font = { size: 9, name: 'Arial', color: { argb: '888888' }, italic: true };
    }
    for (let c = 1; c <= MAIN_COLS; c++) {
      ws.getCell(r, c).border = thinBorder;
      const cell = ws.getCell(r, c);
      if (!cell.font) cell.font = { size: 10, name: 'Arial' };
    }
    r++;
  }
  const pkgLastRow = r - 1;
  const pkgSubRow = r;
  ws.getCell(r, 1).value = '包装小计';
  ws.getCell(r, 1).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  ws.getCell(r, 5).value =
    pkgLastRow >= pkgFirstRow
      ? { formula: `SUM(E${pkgFirstRow}:E${pkgLastRow})` }
      : 0;
  ws.getCell(r, 5).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  for (let c = 1; c <= MAIN_COLS; c++) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
    ws.getCell(r, c).border = thickBorder;
  }
  r += 2;

  // ---- 工艺 ----
  ws.mergeCells(r, 1, r, MAIN_COLS);
  ws.getCell(r, 1).value = '【工艺】';
  ws.getCell(r, 1).font = { bold: true, size: 10, name: 'Arial' };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.craftBg } };
  r++;

  ['', '图片', '编号', '名称', '数量', '单价', '金额', '', '', '', '', '', '', '', '备注'].forEach((h, ci) => {
    const cell = ws.getCell(r, ci + 1);
    cell.value = h || null;
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10, name: 'Arial' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.darkHeader } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center' };
  });
  r++;

  const craftFirstRow = r;
  for (const item of sheet.craft_items ?? []) {
    ws.getCell(r, 2).value = item.image_url ?? '';
    ws.getCell(r, 2).alignment = { horizontal: 'left' };
    ws.getCell(r, 3).value = item.code; ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 4).value = item.name; ws.getCell(r, 4).alignment = { horizontal: 'left' };
    ws.getCell(r, 5).value = item.quantity; ws.getCell(r, 5).alignment = { horizontal: 'center' };
    ws.getCell(r, 6).value = item.unit_price; ws.getCell(r, 6).alignment = { horizontal: 'center' };
    ws.getCell(r, 7).value = { formula: `E${r}*F${r}` };
    ws.getCell(r, 7).alignment = { horizontal: 'center' };
    if (item.is_pattern_bound) {
      ws.getCell(r, 15).value = '绑定款号';
      ws.getCell(r, 15).font = { size: 9, name: 'Arial', color: { argb: '888888' }, italic: true };
    }
    for (let c = 1; c <= MAIN_COLS; c++) {
      ws.getCell(r, c).border = thinBorder;
      const cell = ws.getCell(r, c);
      if (!cell.font) cell.font = { size: 10, name: 'Arial' };
    }
    r++;
  }
  const craftLastRow = r - 1;
  const craftSubRow = r;
  ws.getCell(r, 1).value = '工艺小计';
  ws.getCell(r, 1).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  ws.getCell(r, 7).value =
    craftLastRow >= craftFirstRow
      ? { formula: `SUM(G${craftFirstRow}:G${craftLastRow})` }
      : 0;
  ws.getCell(r, 7).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  for (let c = 1; c <= MAIN_COLS; c++) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
    ws.getCell(r, c).border = thickBorder;
  }
  r += 2;

  // ---- 油边 ----
  ws.mergeCells(r, 1, r, MAIN_COLS);
  ws.getCell(r, 1).value = '【油边】';
  ws.getCell(r, 1).font = { bold: true, size: 10, name: 'Arial' };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.oilBg } };
  r++;

  ws.getCell(r, 2).value = '总长(寸)'; ws.getCell(r, 2).font = { bold: true, size: 10, name: 'Arial' }; ws.getCell(r, 2).alignment = { horizontal: 'center' };
  ws.getCell(r, 3).value = '数量'; ws.getCell(r, 3).font = { bold: true, size: 10, name: 'Arial' }; ws.getCell(r, 3).alignment = { horizontal: 'center' };
  ws.getCell(r, 4).value = '单价'; ws.getCell(r, 4).font = { bold: true, size: 10, name: 'Arial' }; ws.getCell(r, 4).alignment = { horizontal: 'center' };
  ws.getCell(r, 5).value = '金额'; ws.getCell(r, 5).font = { bold: true, size: 10, name: 'Arial' }; ws.getCell(r, 5).alignment = { horizontal: 'center' };
  for (let c = 1; c <= MAIN_COLS; c++) ws.getCell(r, c).border = thinBorder;
  r++;

  let oilDataRow = 0;
  if (oilEdgeSnapshot) {
    oilDataRow = r;
    ws.getCell(r, 2).value = oilEdgeSnapshot.total_length_inches; ws.getCell(r, 2).alignment = { horizontal: 'center' };
    ws.getCell(r, 3).value = oilEdgeSnapshot.quantity; ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 4).value = oilEdgeSnapshot.unit_price; ws.getCell(r, 4).alignment = { horizontal: 'center' };
    ws.getCell(r, 5).value = { formula: `B${r}*C${r}*D${r}` };
    ws.getCell(r, 5).alignment = { horizontal: 'center' };
    for (let c = 1; c <= MAIN_COLS; c++) { ws.getCell(r, c).border = thinBorder; ws.getCell(r, c).font = { size: 10, name: 'Arial' }; }
  }
  r += 2;

  // ---- 人工 ----
  ws.mergeCells(r, 1, r, MAIN_COLS);
  ws.getCell(r, 1).value = '【人工】';
  ws.getCell(r, 1).font = { bold: true, size: 10, name: 'Arial' };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D0E0E3' } };
  r++;

  const laborCosts = loadLaborCosts();
  const laborFirstRow = r;
  for (const lc of laborCosts) {
    ws.getCell(r, 2).value = lc.name; ws.getCell(r, 2).alignment = { horizontal: 'left' };
    ws.getCell(r, 3).value = 1; ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 4).value = lc.unit_price; ws.getCell(r, 4).alignment = { horizontal: 'center' };
    ws.getCell(r, 5).value = { formula: `C${r}*D${r}` };
    ws.getCell(r, 5).alignment = { horizontal: 'center' };
    for (let c = 1; c <= MAIN_COLS; c++) { ws.getCell(r, c).border = thinBorder; ws.getCell(r, c).font = { size: 10, name: 'Arial' }; }
    r++;
  }
  const laborLastRow = r - 1;
  const laborSubRow = r;
  ws.getCell(r, 1).value = '人工小计';
  ws.getCell(r, 1).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  ws.getCell(r, 5).value =
    laborLastRow >= laborFirstRow
      ? { formula: `SUM(E${laborFirstRow}:E${laborLastRow})` }
      : 0;
  ws.getCell(r, 5).font = { bold: true, color: { argb: COLORS.red }, size: 10, name: 'Arial' };
  for (let c = 1; c <= MAIN_COLS; c++) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
    ws.getCell(r, c).border = thickBorder;
  }
  r += 2;

  // ---- 总计（与各区块小计单元格联动）----
  const oilPart = oilDataRow > 0 ? `E${oilDataRow}` : '0';
  const grandTotalFormula = `K${materialGrandRow}+G${hwSubRow}+E${pkgSubRow}+G${craftSubRow}+${oilPart}+E${laborSubRow}`;
  ws.getCell(r, 1).value = '所有总计 (RMB)';
  ws.getCell(r, 1).font = { bold: true, size: 12, name: 'Arial', color: { argb: COLORS.red } };
  ws.getCell(r, 5).value = { formula: grandTotalFormula };
  ws.getCell(r, 5).font = { bold: true, size: 12, name: 'Arial', color: { argb: COLORS.red } };
  const grandTotalRmbRow = r;
  for (let c = 1; c <= MAIN_COLS; c++) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
    ws.getCell(r, c).border = thickBorder;
  }
  r++;

  const usdRate = 7.0;
  ws.getCell(r, 1).value = '所有总计 (USD)';
  ws.getCell(r, 1).font = { bold: true, size: 12, name: 'Arial', color: { argb: COLORS.red } };
  ws.getCell(r, 5).value = { formula: `E${grandTotalRmbRow}/${usdRate}` };
  ws.getCell(r, 5).font = { bold: true, size: 12, name: 'Arial', color: { argb: COLORS.red } };
  ws.getCell(r, 15).value = `汇率: ${usdRate}`;
  ws.getCell(r, 15).font = { size: 9, name: 'Arial', color: { argb: '888888' }, italic: true };
  for (let c = 1; c <= MAIN_COLS; c++) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
    ws.getCell(r, c).border = thickBorder;
  }

  // ---- 列宽 ----
  const widths = [20, 16, 10, 10, 8, 8, 8, 10, 10, 10, 12, 10, 10, 10, 18];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ---- 颜色物料对照表Sheet ----
  if (sheet.color_material_map && sheet.color_material_map.length > 0) {
    const ws2 = wb.addWorksheet('颜色物料对照表');

    ws2.mergeCells('A1:J1');
    ws2.getCell('A1').value = '颜色-物料对照表';
    ws2.getCell('A1').font = { bold: true, size: 13, name: 'Arial' };
    ws2.getCell('A1').alignment = { horizontal: 'center' };

    ws2.getCell('A3').value = '纸格款号：';
    ws2.getCell('A3').font = { bold: true, name: 'Arial', size: 10 };
    ws2.getCell('B3').value = sheet.pattern_code;
    ws2.getCell('B3').font = { bold: true, size: 11, name: 'Arial', color: { argb: '0000FF' } };

    // 收集所有mapping的key作为列头
    const allKeys = new Set<string>();
    for (const entry of sheet.color_material_map) {
      Object.keys(entry.mappings).forEach((k) => allKeys.add(k));
    }
    const keyList = Array.from(allKeys);

    // 列头
    const colorHeaders = ['颜色(中文)', 'Color(英文)', ...keyList];
    colorHeaders.forEach((h, i) => {
      const cell = ws2.getCell(5, i + 1);
      cell.value = h;
      cell.font = i < 2
        ? { bold: true, color: { argb: COLORS.white }, size: 10, name: 'Arial' }
        : { bold: true, size: 10, name: 'Arial' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i < 2 ? '555555' : 'E8E8E8' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = thinBorder;
    });

    // 数据
    sheet.color_material_map.forEach((entry, idx) => {
      const row = 6 + idx;
      ws2.getCell(row, 1).value = entry.color_zh;
      ws2.getCell(row, 1).font = { bold: true, size: 10, name: 'Arial' };
      ws2.getCell(row, 2).value = entry.color_en;
      ws2.getCell(row, 2).alignment = { horizontal: 'center' };
      keyList.forEach((key, ki) => {
        ws2.getCell(row, 3 + ki).value = entry.mappings[key] ?? null;
        ws2.getCell(row, 3 + ki).alignment = { horizontal: 'center' };
      });
      for (let c = 1; c <= colorHeaders.length; c++) {
        ws2.getCell(row, c).border = thinBorder;
        const cell = ws2.getCell(row, c);
        if (!cell.font) cell.font = { size: 10, name: 'Arial' };
      }
    });

    // 列宽
    [14, 16, ...keyList.map(() => 22)].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
  }

  // ---- 生产要求 Sheet（两列自由行） ----
  if (sheet.production_requirements && sheet.production_requirements.length > 0) {
    const wsp = wb.addWorksheet('生产要求');
    wsp.mergeCells(1, 1, 1, 2);
    wsp.getCell(1, 1).value = '生产要求';
    wsp.getCell(1, 1).font = { bold: true, size: 14, name: 'Microsoft YaHei', color: { argb: COLORS.white } };
    wsp.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F3864' } };
    wsp.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    wsp.getRow(1).height = 28;

    wsp.getCell(3, 1).value = '要求项（左列）';
    wsp.getCell(3, 2).value = '具体要求（右列）';
    for (let c = 1; c <= 2; c++) {
      const hc = wsp.getCell(3, c);
      hc.font = { bold: true, size: 10, name: 'Microsoft YaHei', color: { argb: COLORS.white } };
      hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.darkHeader } };
      hc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      hc.border = thinBorder;
    }
    wsp.getRow(3).height = 22;

    const sorted = [...sheet.production_requirements].sort((a, b) => a.sort_order - b.sort_order);
    sorted.forEach((item, idx) => {
      const row = 4 + idx;
      wsp.getCell(row, 1).value = item.label;
      wsp.getCell(row, 2).value = item.content;
      wsp.getCell(row, 1).font = { size: 10, name: 'Microsoft YaHei' };
      wsp.getCell(row, 2).font = { size: 10, name: 'Microsoft YaHei' };
      wsp.getCell(row, 1).alignment = { vertical: 'top', wrapText: true };
      wsp.getCell(row, 2).alignment = { vertical: 'top', wrapText: true };
      wsp.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FAFAFA' } };
      wsp.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FAFAFA' } };
      wsp.getCell(row, 1).border = thinBorder;
      wsp.getCell(row, 2).border = thinBorder;
    });
    wsp.getColumn(1).width = 22;
    wsp.getColumn(2).width = 88;
  }

  // ---- 输出 ----
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `成本表_${sheet.pattern_code}_v${sheet.version}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
