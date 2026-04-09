'use client';

/* ============================================================
 * 供应商导入弹窗
 * 功能：上传 Excel → 解析 → 预览 → 确认导入
 * 列：供应商名称 | 公司全称 | 供应商类型 | 供应商分类（随类型：物料/工艺 各自一套） | 默认账期 | 微信号 | 联系群名称 | 群人数
 * ============================================================ */

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { SupplierItem, SupplierType, SupplierCategory } from './mockData';
import {
  SUPPLIER_CATEGORIES_MATERIAL,
  SUPPLIER_CATEGORIES_PROCESS,
  normalizePaymentTerm,
  resolveImportedCategory,
} from './mockData';

interface ImportSupplierModalProps {
  open: boolean;
  /** 物料供应商分类（与列表页一致，含自定义） */
  materialCategories?: SupplierCategory[];
  processCategories?: SupplierCategory[];
  onClose: () => void;
  onConfirm: (data: SupplierItem[]) => void;
}

type Stage = 'idle' | 'parsing' | 'done';

interface ParseResult {
  data: SupplierItem[];
  errors: string[];
}

const VALID_TYPES: SupplierType[] = ['物料供应商', '工艺供应商'];

async function parseSuppliersExcel(
  file: File,
  materialCategories: readonly string[],
  processCategories: readonly string[],
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const data: SupplierItem[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const name = String(row['供应商名称'] ?? '').trim();
    if (!name) {
      errors.push(`第 ${rowNum} 行：供应商名称为空，已跳过`);
      return;
    }

    const fullName = String(row['公司全称'] ?? '').trim() || name;

    const rawType = String(row['供应商类型'] ?? '物料供应商').trim() as SupplierType;
    const type: SupplierType = VALID_TYPES.includes(rawType) ? rawType : '物料供应商';

    const rawCategory = String(row['供应商分类'] ?? '').trim();
    const category = resolveImportedCategory(rawCategory, type, materialCategories, processCategories);

    const rawTerm = String(row['默认账期'] ?? '').trim();
    const paymentTerm = rawTerm ? normalizePaymentTerm(rawTerm) : '30 天';
    const wechatId = String(row['微信号'] ?? '').trim();
    const contactGroup = String(row['联系群名称'] ?? '').trim();
    const groupMembers = parseInt(String(row['群人数'] ?? '0'), 10) || 0;

    data.push({
      id: `imported_${idx}_${Date.now()}`,
      name,
      fullName,
      type,
      category,
      paymentTerm,
      wechatBound: !!wechatId,
      contactGroup,
      groupMembers,
      wechatId,
      hasLicense: false,
      status: '启用',
      createdAt: new Date().toISOString().slice(0, 10),
    });
  });

  return { data, errors };
}

export function downloadSupplierTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['供应商名称', '公司全称', '供应商类型', '供应商分类', '默认账期', '微信号', '联系群名称', '群人数'],
    ['华信贸易', '深圳市华信贸易有限公司', '物料供应商', '面料', '45 天', 'wx_huaxin2024', '华信贸易采购群', 35],
    ['德力印花', '佛山市德力印花工艺有限公司', '工艺供应商', '印花', '3 个月', 'dl_yinhua', '德力印花合作群', 15],
  ]);
  ws['!cols'] = [
    { wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 8 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '供应商导入模板');
  XLSX.writeFile(wb, '供应商导入模板.xlsx');
}

export default function ImportSupplierModal({
  open,
  onClose,
  onConfirm,
  materialCategories = [...SUPPLIER_CATEGORIES_MATERIAL],
  processCategories = [...SUPPLIER_CATEGORIES_PROCESS],
}: ImportSupplierModalProps) {
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
    const parsed = await parseSuppliersExcel(file, materialCategories, processCategories);
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">导入供应商</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
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
                      <span className="text-gray-500 text-xs">供应商数</span>
                      <p className="font-bold text-gray-800 text-lg">{result.data.length}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">物料供应商</span>
                      <p className="font-bold text-gray-800 text-lg">
                        {result.data.filter((s) => s.type === '物料供应商').length}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">工艺供应商</span>
                      <p className="font-bold text-gray-800 text-lg">
                        {result.data.filter((s) => s.type === '工艺供应商').length}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {result.data.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs text-gray-600 py-0.5">
                        <span className="font-medium">{s.name}</span>
                        <span>{s.fullName} · {s.category} · {s.type}</span>
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

          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>不确定格式？</span>
            <button
              onClick={downloadSupplierTemplate}
              className="text-blue-500 hover:text-blue-700 underline"
            >
              ↓ 下载导入模板
            </button>
          </div>
        </div>

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
