'use client';

/* ============================================================
 * 客户订单导入弹窗
 * 功能：上传 Excel → 解析 → 预览 → 确认导入
 * 格式：列顺序 PO号 | 订单金额(USD) | PO数量 | 分批 | 订单状态 | 订单日期 | 客户名称
 * ============================================================ */

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { OrderItem, OrderStatus } from './mockData';

interface ImportOrderModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: OrderItem[]) => void;
}

type Stage = 'idle' | 'parsing' | 'done';

interface ParseResult {
  data: OrderItem[];
  errors: string[];
}

const VALID_STATUSES: OrderStatus[] = ['已确认', '待确认', '部分发货', '已发货', '已取消'];

async function parseOrdersExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const data: OrderItem[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // header is row 1
    const poNumber = String(row['PO号'] ?? '').trim();
    if (!poNumber) {
      errors.push(`第 ${rowNum} 行：PO号为空，已跳过`);
      return;
    }

    const rawStatus = String(row['订单状态'] ?? '').trim() as OrderStatus;
    const status: OrderStatus = VALID_STATUSES.includes(rawStatus) ? rawStatus : '待确认';

    const rawDate = row['订单日期'];
    let orderDate = '';
    if (rawDate instanceof Date) {
      orderDate = rawDate.toISOString().slice(0, 10);
    } else if (typeof rawDate === 'string' && rawDate) {
      orderDate = rawDate.replace(/\//g, '-').slice(0, 10);
    } else if (typeof rawDate === 'number') {
      const d = XLSX.SSF.parse_date_code(rawDate);
      orderDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }

    const batchRaw = String(row['分批'] ?? '1').replace(/批/, '');
    data.push({
      id: `imported_${idx}_${Date.now()}`,
      poNumber,
      amount: Number(row['订单金额(USD)'] ?? 0),
      poQty: Number(row['PO数量'] ?? 0),
      batches: Math.max(1, parseInt(batchRaw, 10) || 1),
      status,
      orderDate,
      customerName: String(row['客户名称'] ?? '').trim(),
    });
  });

  return { data, errors };
}

export default function ImportOrderModal({ open, onClose, onConfirm }: ImportOrderModalProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setResult({ data: [], errors: ['仅支持 .xlsx 或 .xls 格式的文件'] });
      setStage('done');
      return;
    }
    setFileName(file.name);
    setStage('parsing');
    setResult(null);
    const parsed = await parseOrdersExcel(file);
    setResult(parsed);
    setStage('done');
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    if (result?.data && result.data.length > 0) {
      onConfirm(result.data);
      handleClose();
    }
  }

  function handleClose() {
    setStage('idle');
    setFileName('');
    setResult(null);
    setIsDragging(false);
    onClose();
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['PO号', '订单金额(USD)', 'PO数量', '分批', '订单状态', '订单日期', '客户名称'],
      ['PO#031826', 32785, 32, '2批', '已确认', '2024-04-10', 'ABC Trading Co.'],
      ['PO#031825', 28450, 28, '1批', '待确认', '2024-04-08', 'Global Bags Ltd.'],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单导入模板');
    XLSX.writeFile(wb, '订单导入模板.xlsx');
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">导入客户订单</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* 上传区域 */}
          {(stage === 'idle' || stage === 'parsing') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
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
                    <p className="text-sm font-medium text-gray-700">点击选择文件，或将文件拖拽至此</p>
                    <p className="text-xs text-gray-400 mt-1">仅支持 .xlsx / .xls 格式</p>
                  </div>
                </>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* 解析结果 */}
          {stage === 'done' && result && (
            <div className="space-y-3">
              {fileName && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>📄</span>
                  <span className="font-medium">{fileName}</span>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠ {result.errors.length} 条警告：</p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-amber-600">{err}</p>
                  ))}
                </div>
              )}

              {result.data.length > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-2">✓ 解析成功，预览数据：</p>
                  <div className="flex gap-6 text-sm mb-2">
                    <div>
                      <span className="text-gray-500 text-xs">订单数</span>
                      <p className="font-bold text-gray-800 text-lg">{result.data.length}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">总金额 (USD)</span>
                      <p className="font-bold text-gray-800 text-lg">
                        ${result.data.reduce((s, o) => s + o.amount, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {result.data.slice(0, 5).map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-xs text-gray-600 py-0.5">
                        <span className="font-medium">{o.poNumber}</span>
                        <span>{o.customerName} · ${o.amount.toLocaleString()} · {o.status}</span>
                      </div>
                    ))}
                    {result.data.length > 5 && (
                      <p className="text-xs text-gray-400 text-center">... 共 {result.data.length} 条</p>
                    )}
                  </div>
                </div>
              )}

              {result.data.length === 0 && result.errors.length === 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-600">未找到有效数据，请检查文件格式。</p>
                </div>
              )}

              <button
                onClick={() => { setStage('idle'); setFileName(''); setResult(null); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline text-center pt-1"
              >
                重新选择文件
              </button>
            </div>
          )}

          {/* 模板下载 */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>不确定格式？</span>
            <button
              onClick={downloadTemplate}
              className="text-blue-500 hover:text-blue-700 underline"
            >
              ↓ 下载导入模板
            </button>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!result || result.data.length === 0}
            className={[
              'px-5 py-2 text-sm font-medium rounded-md transition-colors',
              result && result.data.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            确认导入{result && result.data.length > 0 ? ` (${result.data.length} 条)` : ''}
          </button>
        </div>

      </div>
    </div>
  );
}
