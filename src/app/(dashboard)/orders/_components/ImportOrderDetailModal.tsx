'use client';

/* ============================================================
 * 订单明细导入弹窗（订单总览）
 * 模板含 PO# 列：每行指定所属订单，支持同一文件多个 PO
 * ============================================================ */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { OrderDetailItem, ShipmentBatch, OrderDetailData } from '../[id]/_components/mockData';
import type { OrderItem } from './mockData';
import { STORAGE_KEYS } from '@/lib/storageKeys';

export interface ImportOrderDetailModalProps {
  open: boolean;
  onClose: () => void;
  orders: OrderItem[];
  /** 可一次写入多个 PO 的明细 */
  onImported: (payloads: { order: OrderItem; detail: OrderDetailData }[]) => void;
}

/** 统一 PO 字符串便于匹配（支持 TEST001 / PO#TEST001） */
function normalizePoInput(s: string): string {
  const t = String(s ?? '').trim().replace(/\s/g, '');
  if (!t) return '';
  let u = t.toUpperCase();
  if (!u.startsWith('PO')) {
    u = 'PO#' + u.replace(/^#/, '');
  } else if (u.startsWith('PO') && !u.includes('#')) {
    u = 'PO#' + u.slice(2).replace(/^#/, '');
  }
  return u;
}

function findPoColumnIndex(headers: string[]): number {
  const list = headers.map((h, i) => ({ raw: String(h ?? '').trim(), i }));
  for (const { raw, i } of list) {
    const n = raw.toLowerCase().replace(/\s/g, '');
    if (n === 'po' || n === 'po#' || n.startsWith('po#') || raw.includes('PO号') || n === 'ponumber' || n === 'p.o.' || n === 'p.o') {
      return i;
    }
  }
  for (const { raw, i } of list) {
    const low = raw.toLowerCase();
    if (low.includes('po') && !low.includes('ship') && !low.includes('style') && !low.includes('qty') && !low.includes('color')) {
      return i;
    }
  }
  return -1;
}

function resolveOrderByPo(poRaw: string, orders: OrderItem[]): OrderItem | null {
  const key = normalizePoInput(poRaw);
  if (!key) return null;
  return orders.find((o) => normalizePoInput(o.poNumber) === key) ?? null;
}

/** Color / Color颜色 */
function findColorColumnIndex(headers: string[]): number {
  return headers.findIndex((h) => {
    const s = String(h ?? '');
    const low = s.toLowerCase();
    return low.includes('color') || s.includes('颜色');
  });
}

/** 单价：价格FOB / FOB / EXW（不含 EXW Cost） */
function findUnitPriceColumnIndex(headers: string[]): number {
  const list = headers.map((h, i) => ({ s: String(h ?? '').trim(), i }));
  for (const { s, i } of list) {
    const low = s.toLowerCase().replace(/\s/g, '');
    if (low.includes('fob') || s.includes('价格FOB')) return i;
  }
  for (const { s, i } of list) {
    const low = s.toLowerCase();
    if (low.includes('exw') && !low.includes('cost')) return i;
  }
  return -1;
}

/** 数量 / QTY */
function findQtyColumnIndex(headers: string[]): number {
  return headers.findIndex((h) => {
    const s = String(h ?? '');
    return s.includes('数量') || s.toLowerCase().includes('qty');
  });
}

interface ImportResult {
  /** 按订单分组的明细；解析失败或未识别 PO 时为 null */
  byOrder: { order: OrderItem; detail: OrderDetailData }[] | null;
  errors: string[];
}

async function parseDetailExcel(file: File, orders: OrderItem[]): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  if (rawRows.length < 2) return { byOrder: null, errors: ['文件为空或格式不正确'] };

  const headers = rawRows[0] as string[];
  const errors: string[] = [];

  const poIdx = findPoColumnIndex(headers);
  if (poIdx < 0) {
    return {
      byOrder: null,
      errors: ['未找到 PO# / PO号 列。请下载最新模板，填写与系统一致的 PO。'],
    };
  }

  const find = (kw: string) => headers.findIndex((h) => String(h ?? '').toLowerCase().includes(kw.toLowerCase()));
  const skuIdx = find('sku');
  const colorIdx = findColorColumnIndex(headers);
  const styleIdx = find('style');
  const priceIdx = findUnitPriceColumnIndex(headers);
  const qtyIdx = findQtyColumnIndex(headers);

  if (skuIdx < 0) return { byOrder: null, errors: ['未找到 SKU 列，请检查表头'] };
  if (priceIdx < 0) {
    return { byOrder: null, errors: ['未找到「价格FOB」或 EXW 单价列，请检查表头'] };
  }
  if (qtyIdx < 0) return { byOrder: null, errors: ['未找到「数量」或 QTY 列，请检查表头'] };

  const shipCols: { idx: number; date: string }[] = [];
  headers.forEach((h, i) => {
    const hs = String(h ?? '').toLowerCase();
    if (hs.includes('ship date') || hs.includes('ship_date')) {
      const match = String(h).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      const date = match ? match[1] : `批次${shipCols.length + 1}`;
      shipCols.push({ idx: i, date });
    }
  });

  const byPoKey = new Map<string, OrderDetailItem[]>();

  for (let ri = 1; ri < rawRows.length; ri++) {
    const row = rawRows[ri] as unknown[];
    const sku = String(row[skuIdx] ?? '').trim();
    if (!sku || sku.toLowerCase() === 'total') continue;

    const poRaw = String(row[poIdx] ?? '').trim();
    if (!poRaw) {
      errors.push(`第 ${ri + 1} 行：PO# 为空，已跳过`);
      continue;
    }

    const order = resolveOrderByPo(poRaw, orders);
    if (!order) {
      errors.push(`第 ${ri + 1} 行：系统中不存在订单「${poRaw}」，请先在订单总览新建该 PO`);
      continue;
    }

    const poKey = order.id;
    const priceRaw = String(row[priceIdx] ?? '').replace(/[$,\s]/g, '');
    const unitPrice = parseFloat(priceRaw) || 0;
    const quantity = parseInt(String(row[qtyIdx] ?? '0'), 10) || 0;

    const shipments: ShipmentBatch[] = shipCols.map(({ idx, date }) => {
      const val = row[idx];
      if (val === null || val === '' || val === '-' || val === '—') return { date, qty: null };
      const n = parseInt(String(val), 10);
      return { date, qty: isNaN(n) ? null : n };
    });

    if (!unitPrice && !quantity) {
      errors.push(`第 ${ri + 1} 行：单价与数量均为空，已跳过`);
      continue;
    }

    const item: OrderDetailItem = {
      id: `imp_${ri}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sku,
      colorName: colorIdx >= 0 ? String(row[colorIdx] ?? '').trim() : '',
      styleName: styleIdx >= 0 ? String(row[styleIdx] ?? '').trim() : '',
      unitPrice,
      quantity,
      shipments,
      remarks: '',
    };

    const list = byPoKey.get(poKey) ?? [];
    list.push(item);
    byPoKey.set(poKey, list);
  }

  if (byPoKey.size === 0) {
    return { byOrder: null, errors: errors.length ? errors : ['未解析到有效明细行（请检查 PO# 是否与系统订单一致）'] };
  }

  const shipmentDates = shipCols.map((c) => c.date);
  const byOrder: { order: OrderItem; detail: OrderDetailData }[] = [];

  byPoKey.forEach((items, orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || items.length === 0) return;
    byOrder.push({
      order,
      detail: {
        shipmentDates,
        items,
      },
    });
  });

  return { byOrder, errors };
}

export default function ImportOrderDetailModal({
  open,
  onClose,
  orders,
  onImported,
}: ImportOrderDetailModalProps) {
  const [stage, setStage] = useState<'idle' | 'parsing' | 'done'>('idle');
  const [isDragging, setIsDrag] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStage('idle');
    setFileName('');
    setResult(null);
    setIsDrag(false);
  }, [open]);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setResult({ byOrder: null, errors: ['仅支持 .xlsx / .xls 格式'] });
      setStage('done');
      return;
    }
    setFileName(file.name);
    setStage('parsing');
    setResult(null);
    const res = await parseDetailExcel(file, orders);
    setResult(res);
    setStage('done');
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  function handleConfirm() {
    if (!result?.byOrder || result.byOrder.length === 0) return;
    for (const { order, detail } of result.byOrder) {
      try {
        localStorage.setItem(STORAGE_KEYS.ORDER_DETAIL_PREFIX + order.id, JSON.stringify(detail));
      } catch { /* quota */ }
    }
    onImported(result.byOrder);
    onClose();
  }

  function downloadTemplate() {
    const rows = [
      ['PO#', 'SKU', 'Color颜色', 'Style Name', '价格FOB', '数量', 'Ship date Start 4/15/26', 'Ship date Start 4/30/26'],
      ['PO#TEST001', '26SP-W1694-1PRSE-TNC-BLU1-ONS', 'ROYAL BLUE/LIME', 'VANITY RALLY SHOULDER BAG', 13, 80, 50, 30],
      ['PO#TEST001', '26SP-W1695-1PRSE-CRC-GRN1-ONS', 'MATCHA', 'RALLY SHOULDER BAG', 13, 80, '', 80],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 36 }, { wch: 16 }, { wch: 26 },
      { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单明细模板');
    XLSX.writeFile(wb, '订单明细导入模板.xlsx');
  }

  const totalSku =
    result?.byOrder?.reduce((s, g) => s + g.detail.items.length, 0) ?? 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">导入订单明细</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              模板含 <span className="text-gray-600 font-medium">PO#</span> 列，每行填写对应订单号；支持同一文件多个 PO
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {(stage === 'idle' || stage === 'parsing') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
              onDragLeave={() => setIsDrag(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={[
                'flex flex-col items-center justify-center gap-3 h-36 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
                stage === 'parsing' ? 'pointer-events-none opacity-60' : '',
              ].join(' ')}
            >
              {stage === 'parsing' ? (
                <>
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">正在解析 {fileName}...</p>
                </>
              ) : (
                <>
                  <div className="text-3xl">📂</div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">点击选择文件，或拖拽至此</p>
                    <p className="text-xs text-gray-400 mt-1">需包含 PO# 列，且 PO 已在订单总览中存在</p>
                  </div>
                </>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            className="hidden"
          />

          {stage === 'done' && result && (
            <div className="space-y-3">
              {fileName && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>📄</span>
                  <span className="font-medium">{fileName}</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 max-h-36 overflow-y-auto">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠ {result.errors.length} 条提示</p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-amber-600">{err}</p>
                  ))}
                </div>
              )}
              {result.byOrder && result.byOrder.length > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-700">✓ 解析成功</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">订单数</span>
                      <p className="font-bold text-gray-800 text-lg">{result.byOrder.length}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">明细行数</span>
                      <p className="font-bold text-gray-800 text-lg">{totalSku}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.byOrder.map(({ order, detail }) => (
                      <span
                        key={order.id}
                        className="text-xs bg-white border border-green-200 text-green-800 px-2 py-1 rounded-md"
                      >
                        {order.poNumber}（{detail.items.length} 行）
                      </span>
                    ))}
                  </div>
                  {result.byOrder[0] && (
                    <p className="text-xs text-gray-500">
                      批次数：{result.byOrder[0].detail.shipmentDates.length}
                      {result.byOrder[0].detail.shipmentDates.map((d, i) => (
                        <span key={i} className="ml-1">· 批次{i + 1} {d}</span>
                      ))}
                    </p>
                  )}
                </div>
              )}
              {!result.byOrder && result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-600">无法导入：请按提示修正表格后重试。</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => { setStage('idle'); setFileName(''); setResult(null); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline text-center pt-1"
              >
                重新选择文件
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>含 PO# 列的模板</span>
            <button type="button" onClick={downloadTemplate} className="text-blue-500 hover:text-blue-700 underline">
              ↓ 下载导入模板
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!result?.byOrder || result.byOrder.length === 0}
            className={[
              'px-5 py-2 text-sm font-medium rounded-md transition-colors',
              result?.byOrder && result.byOrder.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            确认导入{result?.byOrder && result.byOrder.length > 0 ? `（${totalSku} 行 / ${result.byOrder.length} 个 PO）` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
