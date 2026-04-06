'use client';

/* ============================================================
 * 导入弹窗组件
 * 功能：上传 Excel → 解析 → 校验 → 预览 → 确认导入
 * 使用：<ImportModal open={true} onClose={...} onConfirm={...} />
 * ============================================================ */

import { useState, useRef, useCallback } from 'react';
import { parseInventoryExcel, downloadImportTemplate } from '@/lib/excelUtils';
import type { ParseResult } from '@/lib/excelUtils';
import type { PoGroupData } from './mockData';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  /** 用户确认导入后，将解析好的数据回传给父页面 */
  onConfirm: (data: PoGroupData[]) => void;
}

/** 弹窗的处理阶段 */
type Stage = 'idle' | 'parsing' | 'done';

export default function ImportModal({ open, onClose, onConfirm }: ImportModalProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);

  /* 隐藏的文件输入框引用 */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 解析文件的核心逻辑 */
  async function handleFile(file: File) {
    /* 校验文件类型 */
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setResult({
        success: false,
        data: [],
        errors: [{ row: 0, message: '仅支持 .xlsx 或 .xls 格式的文件' }],
        summary: { poCount: 0, skuCount: 0 },
      });
      setStage('done');
      return;
    }

    setFileName(file.name);
    setStage('parsing');
    setResult(null);

    /* 调用解析工具函数 */
    const parsed = await parseInventoryExcel(file);
    setResult(parsed);
    setStage('done');
  }

  /* 点击选择文件 */
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    /* 清空 input，允许重复选同一文件 */
    e.target.value = '';
  }

  /* 拖拽处理 */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  /* 确认导入 */
  function handleConfirm() {
    if (result?.data && result.data.length > 0) {
      onConfirm(result.data);
      handleClose();
    }
  }

  /* 关闭并重置状态 */
  function handleClose() {
    setStage('idle');
    setFileName('');
    setResult(null);
    setIsDragging(false);
    onClose();
  }

  /* 弹窗未开启时不渲染 */
  if (!open) return null;

  return (
    /* 遮罩层 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* 弹窗主体 */}
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">

        {/* ===== 弹窗标题栏 ===== */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">导入出货进度数据</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ===== 阶段一：上传文件区域 ===== */}
          {(stage === 'idle' || stage === 'parsing') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'flex flex-col items-center justify-center gap-3 h-36 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                isDragging ? 'border-gray-500 bg-gray-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
                stage === 'parsing' ? 'pointer-events-none opacity-60' : '',
              ].join(' ')}
            >
              {stage === 'parsing' ? (
                /* 解析中：显示 loading */
                <>
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">正在解析 {fileName}...</p>
                </>
              ) : (
                /* 等待上传 */
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

          {/* 隐藏的文件输入框 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* ===== 阶段二：解析结果 ===== */}
          {stage === 'done' && result && (
            <div className="space-y-3">
              {/* 文件名提示 */}
              {fileName && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>📄</span>
                  <span className="font-medium">{fileName}</span>
                </div>
              )}

              {/* 错误列表 */}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">
                    ⚠ 发现 {result.errors.length} 个问题：
                  </p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {err.row > 0 ? `第 ${err.row} 行：` : ''}{err.message}
                    </p>
                  ))}
                </div>
              )}

              {/* 成功预览 */}
              {result.data.length > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-2">✓ 解析成功，预览数据：</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">订单数（PO）</span>
                      <p className="font-bold text-gray-800 text-lg">{result.summary.poCount}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">SKU 数量</span>
                      <p className="font-bold text-gray-800 text-lg">{result.summary.skuCount}</p>
                    </div>
                  </div>
                  {/* PO 列表简要 */}
                  <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                    {result.data.map((po) => (
                      <div key={po.poNumber} className="flex items-center justify-between text-xs text-gray-600 py-0.5">
                        <span className="font-medium">{po.poNumber}</span>
                        <span>{po.skuCount} 个SKU · 总量 {po.totalQty.toLocaleString()} · 剩余 {po.remaining.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 重新选择文件按钮 */}
              <button
                onClick={() => { setStage('idle'); setFileName(''); setResult(null); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline text-center pt-1"
              >
                重新选择文件
              </button>
            </div>
          )}

          {/* ===== 模板下载提示 ===== */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>不知道格式？</span>
            <button
              onClick={downloadImportTemplate}
              className="text-blue-500 hover:text-blue-700 underline"
            >
              ↓ 下载导入模板
            </button>
          </div>
        </div>

        {/* ===== 底部操作按钮 ===== */}
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
                ? 'bg-gray-900 text-white hover:bg-gray-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            确认导入 {result && result.data.length > 0 ? `(${result.summary.skuCount} 条)` : ''}
          </button>
        </div>

      </div>
    </div>
  );
}
