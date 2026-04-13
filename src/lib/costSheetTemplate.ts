/* ============================================================
 * 成本表导入模板生成器
 * ============================================================ */

type WS = import('exceljs').Worksheet;
type EBorder = Partial<import('exceljs').Borders>;

// ── 颜色常量 ──────────────────────────────────────────────
const C = {
  // 成本表
  navy:       '1F3864',
  headerBg:   '333333',   // 常规列头背景
  /** 油边/过胶/备注 列头：浅色底 + 深字（避免过黑） */
  specialBg:  'D8DCE3',
  specialFg:  '333333',
  rowFill:    'FFFFFF',   // 数据行
  hwBg:       'FDEADA',   // 【五金】区块条（浅杏色，与参考图一致）
  pkgBg:      'EAD1DC',
  craftBg:    'C9DAF8',
  oilBg:      'FFEEB3',
  hintBg:     'FFFDE7',
  hintText:   '888888',
  white:      'FFFFFF',
  blue:       '1155CC',
  // 包装材料（与「包装页面参考.xlsx」一致）
  pkgTitle:      '6B2424',   // R1 标题（深酒红，近似参考 theme5）
  pkgNoteRow:    'F0F0F0',   // R2 说明行
  pkgClothHdr:   '404040',   // R3 布袋 A:D
  pkgPlasticHdr: '606060',   // R3 胶袋 E
  pkgSubCol:     'BDBDBD',   // R4 布袋/胶袋列头
  pkgData:       'FAFAFA',   // 数据行底
  pkgStickerSec: '4E342E',   // R7 贴纸区块标题
  pkgStickerCol: 'EADED3',   // R8 贴纸列头
  pkgWashSec:    '987050',   // R11 洗水唛
  pkgCartonSec:  'C08A5A',   // R15 纸箱
  pkgInfoSec:    'CEB59A',   // R19 包装信息
  pkgFooter:     'FFFDE7',   // R23 底部说明
  pkgBorder:     'B0B0B0',   // 细边框
};

function thin(color = C.pkgBorder): EBorder {
  return {
    top:    { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left:   { style: 'thin', color: { argb: color } },
    right:  { style: 'thin', color: { argb: color } },
  };
}
function med(color = '999999'): EBorder {
  return {
    top:    { style: 'medium', color: { argb: color } },
    bottom: { style: 'medium', color: { argb: color } },
    left:   { style: 'medium', color: { argb: color } },
    right:  { style: 'medium', color: { argb: color } },
  };
}

function cl(ws: WS, r: number, c: number) { return ws.getCell(r, c); }

// ─────────────────────────────────────────────────────────
// 成本表 Sheet
// ─────────────────────────────────────────────────────────

/** 列头：A=部件名称 B=长 C=宽 D=件数 E=布幅 F=损耗 G=油边/寸 H=过胶单价 I=备注（无「类别」列，主料/配料等在系统内维护） */
const MAT_COLS = 9;
const MAT_HEADERS = ['部件名称','长','宽','件数','布幅','损耗','油边/寸','过胶单价','备注'];
// G/H/I（7–9 列）为可选列，浅色表头区分
const SPECIAL_COLS = new Set([7, 8, 9]);

async function buildCostSheetTab(wb: import('exceljs').Workbook, sheetName: string, isVariant: boolean) {
  const ws = wb.addWorksheet(sheetName);
  [22, 8, 8, 6, 7, 7, 8, 9, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // R1 标题
  ws.mergeCells(1, 1, 1, MAT_COLS);
  const t = cl(ws, 1, 1);
  t.value = `晟砜皮具 - 成本核算表${isVariant ? `  【${sheetName}】` : ''}`;
  t.font = { bold: true, size: 13, color: { argb: C.white }, name: 'Arial' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // R2 说明
  ws.mergeCells(2, 1, 2, MAT_COLS);
  const d = cl(ws, 2, 1);
  d.value = '单位：皮=码，料=码，纸=张，油边=寸  |  用量=长×宽×件数÷布幅÷36（系统自动计算）';
  d.font = { size: 8, italic: true, color: { argb: C.hintText }, name: 'Arial' };
  d.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F0F0' } };
  ws.getRow(2).height = 15;

  // R3 款号行
  cl(ws, 3, 1).value = '纸格款号：'; cl(ws, 3, 1).font = { bold: true, size: 9, name: 'Arial' };
  cl(ws, 3, 2).font = { size: 9, color: { argb: C.blue }, bold: true, name: 'Arial' };
  cl(ws, 3, 5).value = '日期：';     cl(ws, 3, 5).font = { bold: true, size: 9, name: 'Arial' };
  cl(ws, 3, 8).value = '纸格件数：'; cl(ws, 3, 8).font = { bold: true, size: 9, name: 'Arial' };
  cl(ws, 3, 10).value = '刀缝：';   cl(ws, 3, 10).font = { bold: true, size: 9, name: 'Arial' };
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 4;

  // R5 列头
  MAT_HEADERS.forEach((h, i) => {
    const c = cl(ws, 5, i + 1);
    c.value = h;
    const isSpecial = SPECIAL_COLS.has(i + 1);
    c.font = {
      bold: true,
      size: 9,
      color: { argb: isSpecial ? C.specialFg : C.white },
      name: 'Arial',
    };
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isSpecial ? C.specialBg : C.headerBg },
    };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thin('888888');
  });
  ws.getRow(5).height = 20;

  // ── 物料数据行 ─────────────────────────────────────────
  let r = 6;

  /** 写一条物料示例行（无类别列） */
  function exRow(
    pName: string,
    len: number,
    w: number | null,
    pcs: number,
    fw: number | null,
    oe?: number | null,
    gp?: number | null,
    note?: string,
  ) {
    const vals: (string | number | null)[] = [
      pName,
      len,
      w,
      pcs,
      fw,
      0.03,
      oe ?? null,
      gp ?? null,
      note ?? null,
    ];
    vals.forEach((v, i) => {
      const c = cl(ws, r, i + 1);
      if (v !== null && v !== undefined) c.value = v as string | number;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.rowFill } };
      c.border = thin('DDDDDD');
      c.alignment = { horizontal: i > 0 ? 'center' : 'left', vertical: 'middle' };
      c.font = { size: 9, name: 'Arial' };
      // F 列损耗：存小数，显示为百分比（3%）
      if (i === 5 && typeof v === 'number') c.numFmt = '0.00%';
    });
    r++;
  }

  /** 写 n 行空白填写区 */
  function emptyRows(count: number) {
    for (let i = 0; i < count; i++) {
      for (let c = 1; c <= MAT_COLS; c++) {
        const cell = cl(ws, r, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.rowFill } };
        cell.border = thin('DDDDDD');
      }
      r++;
    }
  }

  if (!isVariant) {
    exRow('左右背带底', 17.125, 3.75, 2, 52);
    exRow('前幅主料', 35.875, 0.875, 1, 52);
    exRow('后幅主料', 37.125, 0.875, 2, 52, 10);
    exRow('盖面配料', 14, 12.875, 1, 52);
    exRow('箱头', 17.375, 4.625, 2, 54);
    emptyRows(2);
  } else {
    exRow('左右背带底（压花版）', 17.5, 3.625, 2, 52, 28);
    emptyRows(2);
  }

  // ── 五金/包装/工艺/油边 ─────────────────────────────────
  function sectionTitle(title: string, bg: string) {
    ws.mergeCells(r, 1, r, MAT_COLS);
    const c = cl(ws, r, 1);
    c.value = title;
    c.font = { bold: true, size: 10, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c.border = thin('888888');
    r++;
  }
  /** 仅写前 n 列列头（与桌面模板一致：备注紧跟单价，不留 F–I 空档） */
  function subHeadersCompact(headers: string[]) {
    headers.forEach((h, i) => {
      const c = cl(ws, r, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: C.white }, name: 'Arial' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = thin('888888');
    });
    r++;
  }
  function blankRows(n: number) {
    for (let i = 0; i < n; i++) {
      for (let c = 1; c <= MAT_COLS; c++) {
        const cell = cl(ws, r, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.rowFill } };
        cell.border = thin('DDDDDD');
      }
      r++;
    }
  }

  sectionTitle('【五金】', C.hwBg);
  // 与桌面参考模板一致：名称 | 编号 | 数量 | 单价 | 备注（五列紧邻，无中间空列）
  subHeadersCompact(['名称', '编号', '数量', '单价', '备注']);
  blankRows(2);

  sectionTitle('【包装】', C.pkgBg);
  subHeadersCompact(['编号', '名称', '数量', '单价', '备注']);
  blankRows(2);

  sectionTitle('【工艺】', C.craftBg);
  subHeadersCompact(['编号', '名称', '数量', '单价', '备注']);
  blankRows(2);

  sectionTitle('【油边】', C.oilBg);
  // 总长 | 数量 | 单价 | 备注（四列紧邻；单价导入后参与计算）
  subHeadersCompact(['总长(寸)', '数量', '单价', '备注']);
  blankRows(1);

  // 提示行
  r++;
  ws.mergeCells(r, 1, r, MAT_COLS);
  const hint = cl(ws, r, 1);
  hint.value =
    '【填写说明】① 无「类别」列；主料/配料/里布等在导入后于系统成本明细中调整。② 损耗列填百分数（如 3 或 3%，也兼容 0.03）。③ 物料单价系统自动匹配。④ 油边/寸、过胶单价、备注为可选列。';
  hint.font = { size: 8, italic: true, color: { argb: C.hintText }, name: 'Arial' };
  hint.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.hintBg } };
  ws.getRow(r).height = 24;
}

// ─────────────────────────────────────────────────────────
// 颜色物料对照表 Sheet
// ─────────────────────────────────────────────────────────
function buildColorMapTab(wb: import('exceljs').Workbook) {
  const ws = wb.addWorksheet('颜色物料对照表');
  [14, 16, 22, 22, 22, 16, 14, 18, 24].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.mergeCells('A1:I1');
  const t = cl(ws, 1, 1);
  t.value = '颜色-物料对照表';
  t.font = { bold: true, size: 13, color: { argb: C.white }, name: 'Arial' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
  t.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:I2');
  const d = cl(ws, 2, 1);
  d.value = '【说明】每行对应一个颜色。"成本表引用"列：常规做法留空；特殊做法填写对应Sheet名，如"成本表(压花)"。';
  d.font = { size: 8, italic: true, color: { argb: C.hintText }, name: 'Arial' };
  d.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F0F0' } };

  cl(ws, 3, 1).value = '纸格款号：';
  cl(ws, 3, 1).font = { bold: true, size: 9, name: 'Arial' };
  cl(ws, 3, 2).font = { size: 9, color: { argb: C.blue }, name: 'Arial' };
  ws.getRow(4).height = 4;

  const hdrs = ['颜色(中文)', 'Color(英文)', '主料编号', '配料编号', '里布编号', '车线编号', '五金颜色', '成本表引用', '备注'];
  hdrs.forEach((h, i) => {
    const c = cl(ws, 5, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: C.white }, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 7 ? '7B1FA2' : (i < 2 ? '555555' : C.headerBg) } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thin('888888');
  });
  ws.getRow(5).height = 22;

  const examples = [
    ['黑色',  'BLACK',     '6601-黑色',     'AH2255-401黑',    '麻皮棕皮底',          '697#黑',    '浅金', '',             ''],
    ['深蓝',  'ROYALBLUE', '6601-126#深蓝', 'AH-2255-665深蓝', '棉尼龙C档156号深蓝',  '682#深蓝',  '浅金', '',             ''],
    ['深紫',  'PURPLE',    '6601-120#深紫', 'AH-2255-660角',   '棉尼龙C档138号深紫',  '703#紫',    '浅金', '',             ''],
    ['荧光粉','NEON PINK',  '024#荧光粉',   '624#荧光粉',      '棉尼龙C档258号粉角',  '024#荧光粉','浅金', '成本表(压花)', '三配件相同'],
  ];
  examples.forEach((row, idx) => {
    const r = 6 + idx;
    const isVariant = row[7] !== '';
    row.forEach((val, ci) => {
      const c = cl(ws, r, ci + 1);
      c.value = val || null;
      c.border = thin('CCCCCC');
      c.alignment = { horizontal: ci < 2 ? 'left' : 'center' };
      c.font = { size: 9, name: 'Arial', ...(ci < 2 ? { bold: true } : {}) };
      if (isVariant) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E5F5' } };
      if (ci === 7 && val) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDE7F6' } };
        c.font = { size: 9, color: { argb: '6A1B9A' }, bold: true, name: 'Arial' };
      }
    });
  });
  for (let i = 0; i < 5; i++) {
    for (let c = 1; c <= 9; c++) {
      cl(ws, 10 + i, c).border = thin('CCCCCC');
    }
  }
}

// ─────────────────────────────────────────────────────────
// 包装材料 Sheet — 对齐「包装页面参考.xlsx」（仅 A–E 列，23 行）
// ─────────────────────────────────────────────────────────
function buildPackagingTab(wb: import('exceljs').Workbook) {
  const ws = wb.addWorksheet('包装材料');
  const bdr = thin(C.pkgBorder);

  // 与参考文件列宽一致
  const widths = [16.675, 16.8416666666667, 26, 12.3416666666667, 25.125];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  /** 不需要填写的格子：白底、无边框、无着色网格（与 Excel 默认空白格一致） */
  function plainCell(r: number, c: number) {
    const cell = ws.getCell(r, c);
    cell.value = null;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } };
    cell.font = { name: 'Microsoft YaHei', size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border = undefined as unknown as import('exceljs').Borders;
  }

  function plainRow(r: number, heights?: number) {
    for (let c = 1; c <= 5; c++) plainCell(r, c);
    if (heights != null) ws.getRow(r).height = heights;
  }

  /** 单格样式 */
  function setCell(
    r: number, c: number,
    opts: {
      value?: string | number | null;
      bg?: string;
      fg?: string;
      bold?: boolean;
      italic?: boolean;
      size?: number;
      wrap?: boolean;
      h?: 'left' | 'center' | 'right';
      /** 默认 true；false 时不画格子线（用于与 plain 区衔接时少一层边） */
      border?: boolean;
    },
  ) {
    const cell = ws.getCell(r, c);
    if (opts.value !== undefined) cell.value = opts.value ?? null;
    cell.font = {
      name: 'Microsoft YaHei',
      size: opts.size ?? 10,
      bold: opts.bold,
      italic: opts.italic,
      color: opts.fg ? { argb: opts.fg } : undefined,
    };
    if (opts.bg) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
    }
    if (opts.border !== false) {
      cell.border = bdr;
    } else {
      cell.border = undefined as unknown as import('exceljs').Borders;
    }
    cell.alignment = {
      horizontal: opts.h ?? 'center',
      vertical: 'middle',
      wrapText: opts.wrap ?? false,
    };
  }

  /**
   * 数据行铺底：仅 colFrom–colTo 使用浅灰底+边框，其余列为 plain（不铺色、无格子）
   * @param colFrom 1-based
   * @param colTo 1-based，含
   */
  function paintRow(r: number, bg: string, heights?: number, colFrom = 1, colTo = 5) {
    for (let c = 1; c <= 5; c++) {
      if (c >= colFrom && c <= colTo) setCell(r, c, { bg });
      else plainCell(r, c);
    }
    if (heights != null) ws.getRow(r).height = heights;
  }

  // R1 标题 A1:E1
  ws.mergeCells(1, 1, 1, 5);
  setCell(1, 1, {
    value: '包装材料',
    bg: C.pkgTitle,
    fg: C.white,
    bold: true,
    size: 16,
    h: 'center',
  });
  ws.getRow(1).height = 28.5;

  // R2 说明 A2:E2（文案与参考一致：展示）
  ws.mergeCells(2, 1, 2, 5);
  setCell(2, 1, {
    value: '【说明】填写此款号的包装规格，由系统存档展示，不参与成本计算。',
    bg: C.pkgNoteRow,
    fg: '666666',
    size: 10,
    wrap: true,
    h: 'left',
  });
  ws.getRow(2).height = 22.5;

  // R3：布袋 A3:D3 + 胶袋 E3（分两格，不合并 D–E）
  ws.mergeCells(3, 1, 3, 4);
  setCell(3, 1, { value: '布袋', bg: C.pkgClothHdr, fg: C.white, bold: true, size: 10, h: 'left' });
  setCell(3, 5, { value: '胶袋', bg: C.pkgPlasticHdr, fg: C.white, bold: true, size: 10, h: 'center' });
  ws.getRow(3).height = 22.5;

  // R4 列头
  const r4Labels = ['LOGO位置\n高度注上(CM)', 'LOGO型号', '长*高(CM)', '手腕中高', '规格(CM)'];
  r4Labels.forEach((text, i) => {
    setCell(4, i + 1, {
      value: text,
      bg: C.pkgSubCol,
      fg: '333333',
      bold: true,
      size: 11,
      wrap: true,
      h: 'center',
    });
  });
  ws.getRow(4).height = 39;

  // R5–R6 两行空白数据（布袋+胶袋）
  paintRow(5, C.pkgData, 22.5);
  paintRow(6, C.pkgData, 22.5);

  // R7 贴纸 A7:C7
  ws.mergeCells(7, 1, 7, 3);
  setCell(7, 1, { value: '贴纸', bg: C.pkgStickerSec, fg: C.white, bold: true, size: 10, h: 'left' });
  ws.getRow(7).height = 22.5;
  plainCell(7, 4);
  plainCell(7, 5);

  // R8 贴纸列头（抬头仅类别名；默认尺寸预填在下一行）
  const r8Labels = ['吊牌贴纸', '胶带贴纸', '纸箱贴纸'];
  r8Labels.forEach((text, i) => {
    setCell(8, i + 1, {
      value: text,
      bg: C.pkgStickerCol,
      fg: '333333',
      bold: true,
      size: 10,
      wrap: true,
      h: 'center',
    });
  });
  ws.getRow(8).height = 26;
  plainCell(8, 4);
  plainCell(8, 5);

  // R9 默认尺寸（99% 沿用，一般无需改；填写数量时请填数字，可覆盖本行）
  paintRow(9, C.pkgData, 32, 1, 3);
  setCell(9, 1, {
    value: '6×2.5CM',
    bg: C.pkgData,
    fg: '333333',
    size: 10,
    h: 'center',
    wrap: true,
  });
  setCell(9, 2, {
    value: '10×3.5CM',
    bg: C.pkgData,
    fg: '333333',
    size: 10,
    h: 'center',
    wrap: true,
  });
  setCell(9, 3, {
    value: '10×3.5CM\n（数量=订单使用的纸箱数量*2）',
    bg: C.pkgData,
    fg: '666666',
    italic: true,
    size: 10,
    h: 'center',
    wrap: true,
  });
  ws.getRow(9).height = 36;

  // R10 空行（整行不设表格底纹）
  plainRow(10, 22.5);

  // R11 洗水唛 A11:B11
  ws.mergeCells(11, 1, 11, 2);
  setCell(11, 1, { value: '洗水唛', bg: C.pkgWashSec, fg: C.white, bold: true, size: 10, h: 'center' });
  ws.getRow(11).height = 22.5;
  plainCell(11, 3);
  plainCell(11, 4);
  plainCell(11, 5);

  // R12
  setCell(12, 1, { value: '印刷的PO#', bg: C.pkgStickerCol, fg: '333333', bold: true, size: 10, h: 'center', wrap: true });
  setCell(12, 2, { value: '规格（大/小）', bg: C.pkgStickerCol, fg: '333333', bold: true, size: 10, h: 'center', wrap: true });
  ws.getRow(12).height = 22.5;
  plainCell(12, 3);
  plainCell(12, 4);
  plainCell(12, 5);

  // R13 数据（仅 A–B）
  paintRow(13, C.pkgData, 22.5, 1, 2);

  // R14 空行
  plainRow(14, 22.5);

  // R15 纸箱 A15:B15
  ws.mergeCells(15, 1, 15, 2);
  setCell(15, 1, { value: '纸箱', bg: C.pkgCartonSec, fg: C.white, bold: true, size: 10, h: 'center' });
  ws.getRow(15).height = 22.5;
  plainCell(15, 3);
  plainCell(15, 4);
  plainCell(15, 5);

  setCell(16, 1, { value: '尺寸(CM)', bg: C.pkgStickerCol, fg: '333333', bold: true, size: 10, h: 'center' });
  setCell(16, 2, { value: '每箱/数量', bg: C.pkgStickerCol, fg: '333333', bold: true, size: 10, h: 'center' });
  ws.getRow(16).height = 22.5;
  plainCell(16, 3);
  plainCell(16, 4);
  plainCell(16, 5);

  paintRow(17, C.pkgData, 22.5, 1, 2);

  plainRow(18, 22.5);

  // R19 包装信息 A19:B19
  ws.mergeCells(19, 1, 19, 2);
  setCell(19, 1, { value: '包装信息', bg: C.pkgInfoSec, fg: C.white, bold: true, size: 10, h: 'center' });
  ws.getRow(19).height = 22.5;
  plainCell(19, 3);
  plainCell(19, 4);
  plainCell(19, 5);

  setCell(20, 1, { value: '尺寸(CM)', bg: C.pkgStickerCol, fg: '333333', bold: true, size: 10, h: 'center' });
  setCell(20, 2, { value: '重量kg', bg: C.pkgStickerCol, fg: '333333', bold: true, size: 10, h: 'center' });
  ws.getRow(20).height = 22.5;
  plainCell(20, 3);
  plainCell(20, 4);
  plainCell(20, 5);

  paintRow(21, C.pkgData, 22.5, 1, 2);

  plainRow(22, 22.5);

  // R23 底部说明 A23:E23
  ws.mergeCells(23, 1, 23, 5);
  setCell(23, 1, {
    value: '【填写说明】按实际情况填写，未用到的留空即可。系统导入后可在成本表详情「包装材料」页面查看。',
    bg: C.pkgFooter,
    fg: '888888',
    italic: true,
    size: 10,
    wrap: true,
    h: 'center',
  });
  ws.getRow(23).height = 22.5;
}

// ─────────────────────────────────────────────────────────
// 生产要求 Sheet — A 列类别（不固定） + B 列说明，行数任意增删
// ─────────────────────────────────────────────────────────
function buildProductionRequirementsTab(wb: import('exceljs').Workbook) {
  const ws = wb.addWorksheet('生产要求');
  const b = thin('CCCCCC');
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 88;

  ws.mergeCells(1, 1, 1, 2);
  const t = ws.getCell(1, 1);
  t.value = '生产要求';
  t.font = { bold: true, size: 14, name: 'Microsoft YaHei', color: { argb: C.white } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, 2);
  const note = ws.getCell(2, 1);
  note.value =
    '【说明】左列填写要求类别（如：五金、油边、织带、车线、拉头、拉链、压唛、注意事项、包装要求等），右列填写具体内容。不同款式行数、项目均不固定，可自行增删行；不需要的项目删除整行即可。「压唛」建议在系统内按编号+位置填写（如 1#，盖面*2 表示 1 号模在盖面压 2 次），勿再贴整页截图。';
  note.font = { size: 9, name: 'Microsoft YaHei', color: { argb: '555555' } };
  note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F0F0' } };
  note.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  ws.getRow(2).height = 54;

  const hdrBg = C.headerBg;
  ['要求项（左列）', '具体要求（右列）'].forEach((text, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = text;
    cell.font = { bold: true, size: 10, name: 'Microsoft YaHei', color: { argb: C.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hdrBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = b;
  });
  ws.getRow(3).height = 26;

  const dataBg = 'FAFAFA';
  const DATA_FIRST = 4;
  const DATA_LAST = 80;
  for (let r = DATA_FIRST; r <= DATA_LAST; r++) {
    for (let col = 1; col <= 2; col++) {
      const cell = ws.getCell(r, col);
      cell.value = null;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dataBg } };
      cell.border = b;
      cell.font = { size: 10, name: 'Microsoft YaHei' };
      cell.alignment = {
        horizontal: 'left',
        vertical: 'top',
        wrapText: true,
      };
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ─────────────────────────────────────────────────────────
// 对外入口
// ─────────────────────────────────────────────────────────
export async function downloadCostSheetTemplate(withVariantSheet = true) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = '晟砜皮具ERP';
  wb.created = new Date();

  await buildCostSheetTab(wb, '成本表(常规)', false);
  if (withVariantSheet) {
    await buildCostSheetTab(wb, '成本表(压花)', true);
  }
  buildColorMapTab(wb);
  buildPackagingTab(wb);
  buildProductionRequirementsTab(wb);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '成本表导入模板.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
