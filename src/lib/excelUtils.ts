/* ============================================================
 * Excel 导入 / 导出工具函数
 * 依赖: xlsx (SheetJS)
 * 使用场景: 订单库存页面的导入、导出按钮
 * ============================================================ */

import * as XLSX from 'xlsx';
import type {
  PoGroupData,
  SkuItem,
  ShipmentColumn,
} from '@/app/(dashboard)/inventory/_components/mockData';
import { normalizePoNumber } from '@/lib/poNumber';

/* ============================================================
 * 公共类型
 * ============================================================ */

/** 单条导入错误 */
export interface ImportError {
  row: number;     // Excel 行号（从1开始）
  message: string; // 错误描述
}

/** parseInventoryExcel 的返回结果 */
export interface ParseResult {
  success: boolean;
  data: PoGroupData[];
  errors: ImportError[];
  summary: { poCount: number; skuCount: number };
}

/* ============================================================
 * 内部辅助函数
 * ============================================================ */

/** 将 JS Date 格式化为 YYYY/MM/DD */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/**
 * 将 Excel 单元格中的日期值统一转为 "YYYY/MM/DD" 字符串
 * Excel 日期可能是 JS Date 对象、序列号数字或字符串
 */
function normalizeDate(val: unknown): string | null {
  if (!val) return null;

  /* xlsx 开启 cellDates: true 后，日期会直接是 JS Date */
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return formatDate(val);
  }

  /* 字符串格式 */
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    /* 已经是 YYYY/MM/DD */
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
    /* YYYY-MM-DD 转换 */
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '/');
    /* 尝试通用解析 */
    const d = new Date(s);
    if (!isNaN(d.getTime())) return formatDate(d);
  }

  return null;
}

/**
 * 将单元格数值解析为整数
 * 支持带逗号的千位分隔符（如 "1,000"）
 */
function parseQty(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Math.round(val);
  if (typeof val === 'string') {
    /* 移除逗号后转数字 */
    const n = Number(val.replace(/,/g, '').trim());
    if (!isNaN(n)) return Math.round(n);
  }
  return null;
}

/* ============================================================
 * 导入：解析 Excel 文件 → PoGroupData[]
 * ============================================================ */

/**
 * 解析上传的 Excel 文件
 * 期望的列顺序：PO号 | 公司订单号 | SKU编码 | 订单总数量 | 入库数量 | 出库日期1 | 出库数量1 | ... | 客户编码
 * 注：「入库数量」列可选；若缺失则默认 = 订单总数量（向前兼容旧模板）
 */
export async function parseInventoryExcel(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      resolve({ success: false, data: [], errors: [{ row: 0, message: '文件读取失败，请重试' }], summary: { poCount: 0, skuCount: 0 } });
    };

    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        /* 读取工作簿，开启 cellDates 让日期自动转为 JS Date */
        const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

        /* 取第一个工作表 */
        const wsName = wb.SheetNames[0];
        if (!wsName) {
          resolve({ success: false, data: [], errors: [{ row: 0, message: 'Excel 文件中没有工作表' }], summary: { poCount: 0, skuCount: 0 } });
          return;
        }

        const ws = wb.Sheets[wsName];
        /* 转为二维数组，header: 1 表示不自动用第一行作列名 */
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

        if (rows.length < 2) {
          resolve({ success: false, data: [], errors: [{ row: 0, message: '文件内容为空，至少需要标题行 + 1 行数据' }], summary: { poCount: 0, skuCount: 0 } });
          return;
        }

        /* 解析标题行，确定列结构 */
        const headerRow = (rows[0] as unknown[]).map((h) => String(h ?? '').trim());

        /* 固定列索引 */
        const COL_PO  = 0;  // PO号
        const COL_WO  = 1;  // 公司订单号
        const COL_SKU = 2;  // SKU编码
        const COL_QTY = 3;  // 订单总数量
        /* 最后一列是客户编码 */
        const COL_CUSTOMER = headerRow.length - 1;

        /* 检测「入库数量」列是否存在（索引4处）
         * - 旧模板：第5列直接是「出库日期1」
         * - 新模板：第5列是「入库数量」，第6列才是「出库日期1」 */
        const hasReceivedQtyCol = headerRow[4]?.includes('入库');
        const COL_RECEIVED = hasReceivedQtyCol ? 4 : -1;   // -1 = 不存在
        const shipmentStartIdx = hasReceivedQtyCol ? 5 : 4; // 出库列从哪里开始

        /* 检查必要列名是否存在 */
        const errors: ImportError[] = [];
        if (!headerRow[COL_PO].includes('PO')) {
          errors.push({ row: 1, message: `第A列应为"PO号"，当前为"${headerRow[COL_PO]}"` });
        }
        if (!headerRow[COL_SKU].includes('SKU') && !headerRow[COL_SKU].includes('sku')) {
          errors.push({ row: 1, message: `第C列应为"SKU编码"，当前为"${headerRow[COL_SKU]}"` });
        }

        /* 出库日期/数量列对数量 */
        const shipmentPairCount = Math.floor((COL_CUSTOMER - shipmentStartIdx) / 2);

        /* 按 PO号 分组收集行数据 */
        const poMap = new Map<string, Array<{
          wo: string | null;
          sku: string;
          totalQty: number;
          receivedQty: number;   // 实际入库数量
          customerCode: string | null;
          rawShipments: Array<{ date: string; qty: number }>;
        }>>();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          /* 跳过完全空行 */
          if (!row || row.every((c) => c === null || c === '')) continue;

          const rowNum = i + 1;
          const rawPo = String(row[COL_PO] ?? '').trim();
          const poNumber = rawPo ? normalizePoNumber(rawPo) : '';
          const wo = row[COL_WO] ? String(row[COL_WO]).trim() : null;
          const sku = String(row[COL_SKU] ?? '').trim();
          const totalQty = parseQty(row[COL_QTY]);
          const customerCode = row[COL_CUSTOMER] ? String(row[COL_CUSTOMER]).trim() : null;

          /* 必填字段校验 */
          if (!poNumber) { errors.push({ row: rowNum, message: `第${rowNum}行：PO号不能为空` }); continue; }
          if (!sku) { errors.push({ row: rowNum, message: `第${rowNum}行：SKU编码不能为空` }); continue; }
          if (totalQty === null || totalQty <= 0) {
            errors.push({ row: rowNum, message: `第${rowNum}行：订单总数量必须为正整数` });
            continue;
          }

          /* 入库数量：有则取，无则默认等于订单数量（兼容旧模板） */
          let receivedQty: number = totalQty;
          if (COL_RECEIVED >= 0) {
            const rv = parseQty(row[COL_RECEIVED]);
            if (rv !== null && rv >= 0) receivedQty = rv;
          }

          /* 解析出库日期/数量对 */
          const rawShipments: Array<{ date: string; qty: number }> = [];
          for (let p = 0; p < shipmentPairCount; p++) {
            const dateIdx = shipmentStartIdx + p * 2;
            const qtyIdx  = shipmentStartIdx + p * 2 + 1;
            const dateStr = normalizeDate(row[dateIdx]);
            const qty = parseQty(row[qtyIdx]);
            if (dateStr && qty !== null) {
              rawShipments.push({ date: dateStr, qty });
            } else if (dateStr && qty === null) {
              /* 有日期但没有数量：提示警告但不中断 */
              errors.push({ row: rowNum, message: `第${rowNum}行：出库日期${p + 1} 有日期但缺少数量，已跳过该出库记录` });
            }
          }

          if (!poMap.has(poNumber)) poMap.set(poNumber, []);
          poMap.get(poNumber)!.push({ wo, sku, totalQty, receivedQty, customerCode, rawShipments });
        }

        /* 如果有严重错误（没有解析出任何数据），直接返回 */
        if (poMap.size === 0) {
          resolve({ success: false, data: [], errors, summary: { poCount: 0, skuCount: 0 } });
          return;
        }

        /* 将收集到的数据转换为 PoGroupData[] */
        const result: PoGroupData[] = [];
        let totalSkus = 0;

        poMap.forEach((rowDataList, poNumber) => {
          /* 收集该 PO 下所有唯一出库日期（排序） */
          const uniqueDatesSet = new Set<string>();
          rowDataList.forEach((r) => r.rawShipments.forEach((s) => uniqueDatesSet.add(s.date)));
          const uniqueDates = Array.from(uniqueDatesSet).sort();

          /* 为每个唯一日期生成出库列（出库单号根据日期自动生成） */
          const columns: ShipmentColumn[] = uniqueDates.map((date, idx) => {
            /* 将日期转为 SQ 单号格式：如 2025/05/10 → SQ250510-001 */
            const digits = date.replace(/\//g, '').slice(2); // "250510"
            const shipmentNo = `SQ${digits}-${String(idx + 1).padStart(3, '0')}`;
            return {
              shipmentId: `imp-${poNumber}-${idx}`,
              date,
              shipmentNo,
              key: `${date}||${shipmentNo}`,
            };
          });

          /* 构建 SkuItem 列表 */
          const items: SkuItem[] = rowDataList.map((r, idx) => {
            /* 初始化所有列为 null */
            const shipments: Record<string, number | null> = {};
            columns.forEach((col) => { shipments[col.key] = null; });

            /* 填入实际出库数据（按日期匹配列） */
            r.rawShipments.forEach((s) => {
              const col = columns.find((c) => c.date === s.date);
              if (col) shipments[col.key] = s.qty;
            });

            /* 剩余库存 = 入库数量 - 已出库合计 */
            const shipped = Object.values(shipments)
              .filter((v): v is number => v !== null)
              .reduce((sum, v) => sum + v, 0);
            const receivedQty = r.receivedQty;
            /* 允许负数：出货超出入库量时 remaining 为负，前端显示红色警告 */
            const remaining = receivedQty - shipped;

            return {
              id: `${poNumber}-${idx + 1}`,
              wo: r.wo,
              patternCode: null,
              imageUrl: null,
              sku: r.sku,
              totalQty: r.totalQty,
              receivedQty,
              remaining,
              customerCode: r.customerCode,
              shipments,
            };
          });

          /* PO 级别汇总 */
          const poTotalQty = items.reduce((s, i) => s + i.totalQty, 0);
          const poReceivedQty = items.reduce((s, i) => s + i.receivedQty, 0);
          const poRemaining = items.reduce((s, i) => s + i.remaining, 0);

          result.push({
            poNumber,
            orderDate: formatDate(new Date()),
            skuCount: items.length,
            totalQty: poTotalQty,
            receivedQty: poReceivedQty,
            remaining: poRemaining,
            columns,
            items,
          });

          totalSkus += items.length;
        });

        resolve({
          success: errors.length === 0,
          data: result,
          errors,
          summary: { poCount: result.length, skuCount: totalSkus },
        });

      } catch (err) {
        /* 捕获任何意外错误，给用户显示友好提示 */
        resolve({
          success: false,
          data: [],
          errors: [{ row: 0, message: `文件解析失败：${err instanceof Error ? err.message : '格式不支持，请使用 .xlsx 格式'}` }],
          summary: { poCount: 0, skuCount: 0 },
        });
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

/* ============================================================
 * 导出：PoGroupData[] → 下载 Excel 文件
 * ============================================================ */

/**
 * 仅保留勾选的 SKU 行；无匹配行时返回空数组
 */
export function filterPoGroupsBySkuIds(
  groups: PoGroupData[],
  selectedIds: ReadonlySet<string>
): PoGroupData[] {
  if (selectedIds.size === 0) return [];
  return groups
    .map((po) => ({
      ...po,
      items: po.items.filter((item) => selectedIds.has(item.id)),
    }))
    .filter((po) => po.items.length > 0);
}

/**
 * 将当前页面展示的数据导出为 Excel 文件并触发下载
 * 列结构：PO号 | 下单日期 | 公司订单号 | SKU编码 | 订单总数量 | 剩余库存 | 出库日期1 | 出库数量1 | ... | 客户编码
 */
export function exportInventoryToExcel(
  groups: PoGroupData[],
  filename = '出货进度导出.xlsx'
): void {
  if (groups.length === 0) {
    alert('没有可导出的数据');
    return;
  }

  /* 找出所有 PO 中最大的出库列数，用于补齐列 */
  const maxShipmentCols = groups.reduce((max, po) => Math.max(max, po.columns.length), 0);

  /* 构建标题行 */
  const header: string[] = [
    'PO号', '下单日期', '公司订单号', 'SKU编码',
    '订单数量', '入库数量', '差数', '剩余库存',
  ];
  for (let i = 1; i <= maxShipmentCols; i++) {
    header.push(`出库日期${i}`, `出库数量${i}`);
  }
  header.push('客户编码');

  /* 构建数据行（每个 SKU 一行） */
  const dataRows: (string | number | null)[][] = [];

  groups.forEach((po) => {
    po.items.forEach((item) => {
      const variance = item.totalQty - item.receivedQty;  // 差数
      const row: (string | number | null)[] = [
        po.poNumber,
        po.orderDate,
        item.wo ?? '',
        item.sku,
        item.totalQty,
        item.receivedQty,
        variance === 0 ? null : variance,   // 0 差数导出为空，突出异常值
        item.remaining,
      ];

      /* 填入该 PO 实际的出库列数据 */
      po.columns.forEach((col) => {
        const qty = item.shipments[col.key];
        row.push(col.date, qty ?? null);
      });

      /* 如果该 PO 出库列数 < 最大列数，补空列保持对齐 */
      for (let i = po.columns.length; i < maxShipmentCols; i++) {
        row.push(null, null);
      }

      row.push(item.customerCode ?? '');
      dataRows.push(row);
    });
  });

  /* 创建工作表 */
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

  /* 设置列宽（单位：字符数） */
  ws['!cols'] = [
    { wch: 16 }, // PO号
    { wch: 12 }, // 下单日期
    { wch: 14 }, // 公司订单号
    { wch: 30 }, // SKU编码（支持长编码）
    { wch: 10 }, // 订单数量
    { wch: 10 }, // 入库数量
    { wch: 8  }, // 差数
    { wch: 10 }, // 剩余库存
    ...Array.from({ length: maxShipmentCols }, () => [{ wch: 14 }, { wch: 10 }]).flat(),
    { wch: 12 }, // 客户编码
  ];

  /* 创建工作簿并下载 */
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '出货进度');
  XLSX.writeFile(wb, filename);
}

/**
 * 生成导入模板文件（帮助用户了解正确格式）
 * 包含示例数据
 */
export function downloadImportTemplate(): void {
  /* 新模板：含「入库数量」列，位于「订单总数量」之后、出库列之前
   * 说明：入库数量 = 实际验收入仓数量，可能 ≠ 订单数量
   *       剩余库存将按「入库数量 - 出库合计」计算 */
  const header = ['PO号', '公司订单号', 'SKU编码', '订单总数量', '入库数量', '出库日期1', '出库数量1', '出库日期2', '出库数量2', '客户编码'];
  const examples = [
    // 正常案例：入库 = 订单
    ['PO#260301', 'TC260301-01', 'SKU-001', 1000, 1000, '2025/05/10', 200, '2025/05/20', 300, '客户A'],
    // 差数案例：订单2000，实际入库1980（少20件）
    ['PO#260301', 'TC260301-02', 'SKU-002', 2000, 1980, '2025/05/10', 450, '2025/05/30', 500, '客户B'],
    // 只有一批出库，入库数量留空时等同订单数量
    ['PO#260302', 'TC260302-01', 'SKU-003', 500,  500,  '2025/06/01', 80,  '',           '',  '客户A'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([header, ...examples]);
  ws['!cols'] = header.map(() => ({ wch: 14 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');
  XLSX.writeFile(wb, '订单库存导入模板.xlsx');
}
