'use client';

/* ============================================================
 * 待补全信息视图 — 电子表格式批量填写
 *
 * 核心交互：
 *  1. Tab/Shift+Tab 横向，Enter 向下
 *  2. 下拉填充：单元格右下角蓝色小柄 → 按住下拖 → 松开复制到所有经过的行
 *  3. 批量填入栏：选中行后顶部出现深色常驻栏，在栏内填值按 Enter 一键覆盖所有选中行
 *  4. 完成条件：纸格款号 + 产品名称 + 大货价 均非空 → 行变绿
 *
 * 行选中方式（Excel 风格）：
 *  - 点击行的「安全区」（主图 / SKU / 颜色）: 选中单行，设为锚点
 *  - Shift + 点击: 从锚点到当前行整体选中
 *  - Ctrl/Cmd + 点击: 切换单行
 *  - 按住拖拽（安全区）: 连续框选多行
 *  - 复选框: 原有逻辑保留
 *
 * 列顺序（分类/币种已移到最后，SKU 列加宽）：
 *   主图 | SKU | 颜色 | 纸格款号* | 产品名称* | 大货价* | 代发价 | 包装重量 | 包装尺寸 | 分类 | 币种 | ✓/×
 * ============================================================ */

import { useState, useEffect, useRef } from 'react';
import type { ProductListItem } from './mockData';
import { CATEGORY_OPTIONS } from './mockData';

const CATEGORIES = CATEGORY_OPTIONS.filter((c) => c !== '全部');
const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];

/* 可填写的字段（Tab 导航 & 下拉填充的字段顺序） */
const FILL_FIELDS = [
  'patternCode', 'name', 'bulkPrice', 'dropshipPrice',
  'packWeight', 'packSize', 'category', 'currency',
] as const;
type FillField = typeof FILL_FIELDS[number];

interface RowEdit {
  patternCode: string;
  name: string;
  bulkPrice: string;
  dropshipPrice: string;
  packWeight: string;
  packSize: string;
  category: string;
  currency: string;
}

export interface PendingRowSave {
  id: string;
  patternCode: string;
  name: string;
  category: string;
  bulkPrice: number;
  dropshipPrice: number;
  currency: string;
  packWeight: string;
  packSize: string;
}

interface PendingCompletionViewProps {
  data: ProductListItem[];
  onSaveRows: (rows: PendingRowSave[]) => void;
  onDiscardRows: (ids: string[]) => void;
}

function isComplete(e: RowEdit) {
  return e.patternCode.trim() !== '' && e.name.trim() !== '' && Number(e.bulkPrice) > 0;
}

function toEdit(p: ProductListItem): RowEdit {
  return {
    patternCode: p.patternCode ?? '',
    name: p.name ?? '',
    bulkPrice: p.bulkPrice > 0 ? String(p.bulkPrice) : '',
    dropshipPrice: p.dropshipPrice > 0 ? String(p.dropshipPrice) : '',
    packWeight: p.packWeight || '',
    packSize: p.packSize || '',
    category: p.category || '手袋',
    currency: p.currency || 'USD',
  };
}

/* 每列的配置 */
const COL_CFG: {
  field: FillField;
  label: string;
  required?: boolean;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: string[];
  width: string;
}[] = [
  { field: 'patternCode', label: '纸格款号', required: true, type: 'text', placeholder: '如 CITYBAG-AP1', width: 'w-36' },
  { field: 'name',        label: '产品名称', required: true, type: 'text', placeholder: '如 蛇纹都市包',   width: 'w-40' },
  { field: 'bulkPrice',   label: '大货价',   required: true, type: 'number', placeholder: '0',            width: 'w-20' },
  { field: 'dropshipPrice',label:'代发价',             type: 'number', placeholder: '0',                  width: 'w-20' },
  { field: 'packWeight',  label: '包装重量',            type: 'text', placeholder: '如 0.5 kg',            width: 'w-24' },
  { field: 'packSize',    label: '包装尺寸',            type: 'text', placeholder: '如 30×20×10',          width: 'w-28' },
  { field: 'category',    label: '分类',                type: 'select', options: CATEGORIES,               width: 'w-16' },
  { field: 'currency',    label: '币种',                type: 'select', options: CURRENCIES,               width: 'w-14' },
];

/* 批量填入栏只显示前6个（分类/币种不需要批量） */
const BATCH_COLS = COL_CFG.slice(0, 6);

const inputBase =
  'w-full px-2 py-1 text-xs bg-transparent border-0 border-b ' +
  'border-gray-200 focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded-t-sm';
const inputRequired =
  'w-full px-2 py-1 text-xs bg-transparent border-0 border-b-2 ' +
  'border-red-300 focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded-t-sm placeholder-red-300';

export default function PendingCompletionView({ data, onSaveRows, onDiscardRows }: PendingCompletionViewProps) {

  /* ——— 编辑状态 ——— */
  const [edits, setEdits] = useState<Map<string, RowEdit>>(() => {
    const m = new Map<string, RowEdit>();
    for (const p of data) m.set(p.id, toEdit(p));
    return m;
  });

  useEffect(() => {
    setEdits((prev) => {
      const next = new Map(prev);
      for (const p of data) { if (!next.has(p.id)) next.set(p.id, toEdit(p)); }
      for (const id of next.keys()) { if (!data.find((p) => p.id === id)) next.delete(id); }
      return next;
    });
  }, [data]);

  function set(id: string, field: FillField, value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      const base = next.get(id) ?? toEdit(data.find((p) => p.id === id)!);
      next.set(id, { ...base, [field]: value });
      return next;
    });
  }

  /* ——— 勾选 ——— */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allChecked = data.length > 0 && data.every((p) => selectedIds.has(p.id));
  const someChecked = data.some((p) => selectedIds.has(p.id));
  function toggleRow(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll(on: boolean) { setSelectedIds(on ? new Set(data.map((p) => p.id)) : new Set()); }

  /* ——— Excel 风格行选中 ——— */
  const [anchorRowIdx, setAnchorRowIdx] = useState<number | null>(null);
  const dragSelectRef = useRef<{ startIdx: number } | null>(null);

  /** 点击「安全区」（图片/SKU/颜色列）选中行，支持 Shift / Ctrl 修饰键 */
  function handleSafeClick(e: React.MouseEvent, rowIdx: number, productId: string) {
    // 如果事件来自 input/select/button，不干预
    if ((e.target as HTMLElement).closest('input, select, button')) return;

    if (e.shiftKey && anchorRowIdx !== null) {
      const from = Math.min(anchorRowIdx, rowIdx);
      const to = Math.max(anchorRowIdx, rowIdx);
      const rangeIds = new Set(data.slice(from, to + 1).map((p) => p.id));
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) => new Set([...prev, ...rangeIds]));
      } else {
        setSelectedIds(rangeIds);
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.has(productId) ? n.delete(productId) : n.add(productId);
        return n;
      });
      setAnchorRowIdx(rowIdx);
    } else {
      setSelectedIds(new Set([productId]));
      setAnchorRowIdx(rowIdx);
    }
  }

  /** 在「安全区」按住鼠标拖拽以框选多行 */
  function startDragSelect(e: React.MouseEvent, rowIdx: number) {
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();

    dragSelectRef.current = { startIdx: rowIdx };
    setSelectedIds(new Set([data[rowIdx].id]));
    setAnchorRowIdx(rowIdx);

    function onMove(ev: MouseEvent) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const tr = el?.closest('[data-pr]') as HTMLElement | null;
      if (tr) {
        const idx = parseInt(tr.dataset.pr ?? '-1');
        if (!isNaN(idx)) {
          const from = Math.min(dragSelectRef.current!.startIdx, idx);
          const to = Math.max(dragSelectRef.current!.startIdx, idx);
          setSelectedIds(new Set(data.slice(from, to + 1).map((p) => p.id)));
        }
      }
    }

    function onUp() {
      dragSelectRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /* ——— 批量填入栏（顶部常驻，勾选后激活） ——— */
  const [batchBar, setBatchBar] = useState<Partial<Record<FillField, string>>>({});

  function applyBatchField(field: FillField, value: string) {
    if (!value.trim()) return;
    setEdits((prev) => {
      const next = new Map(prev);
      for (const id of selectedIds) {
        const cur = next.get(id);
        if (cur) next.set(id, { ...cur, [field]: value.trim() });
      }
      return next;
    });
    setBatchBar((b) => ({ ...b, [field]: '' }));
  }

  function applyAllBatchFields() {
    const hasAny = Object.values(batchBar).some((v) => v && v.trim());
    if (!hasAny) return;
    setEdits((prev) => {
      const next = new Map(prev);
      for (const id of selectedIds) {
        const cur = next.get(id);
        if (!cur) continue;
        const patch: Partial<RowEdit> = {};
        for (const [f, v] of Object.entries(batchBar)) {
          if (v && v.trim()) (patch as Record<string, string>)[f] = v.trim();
        }
        next.set(id, { ...cur, ...patch });
      }
      return next;
    });
    setBatchBar({});
  }

  /* ——— 下拉填充 ——— */
  const [dragVisual, setDragVisual] = useState<{ from: number; to: number; fIdx: number } | null>(null);
  const dragRef = useRef<{ fromRowIdx: number; fIdx: number; value: string; toRowIdx: number } | null>(null);

  function startDragFill(e: React.MouseEvent, rowIdx: number, fIdx: number, value: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!value.trim()) return;
    dragRef.current = { fromRowIdx: rowIdx, fIdx, value, toRowIdx: rowIdx };
    setDragVisual({ from: rowIdx, to: rowIdx, fIdx });

    function onMove(ev: MouseEvent) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const tr = el?.closest('[data-pr]') as HTMLElement | null;
      if (tr) {
        const idx = parseInt(tr.dataset.pr ?? '-1');
        if (!isNaN(idx) && idx >= dragRef.current!.fromRowIdx) {
          dragRef.current!.toRowIdx = idx;
          setDragVisual({ from: dragRef.current!.fromRowIdx, to: idx, fIdx: dragRef.current!.fIdx });
        }
      }
    }

    function onUp() {
      const d = dragRef.current;
      if (d && d.toRowIdx > d.fromRowIdx) {
        const field = FILL_FIELDS[d.fIdx];
        if (field) {
          setEdits((prev) => {
            const next = new Map(prev);
            for (let i = d.fromRowIdx + 1; i <= d.toRowIdx; i++) {
              const p = data[i];
              if (p) {
                const cur = next.get(p.id);
                if (cur) next.set(p.id, { ...cur, [field]: d.value });
              }
            }
            return next;
          });
        }
      }
      dragRef.current = null;
      setDragVisual(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /* ——— 键盘导航 ——— */
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; fIdx: number } | null>(null);

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIdx: number,
    fIdx: number,
  ) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const next = e.shiftKey ? fIdx - 1 : fIdx + 1;
      if (next >= 0 && next < FILL_FIELDS.length) focusCell(data[rowIdx].id, next);
      else if (next < 0 && rowIdx > 0) focusCell(data[rowIdx - 1].id, FILL_FIELDS.length - 1);
      else if (next >= FILL_FIELDS.length && rowIdx < data.length - 1) focusCell(data[rowIdx + 1].id, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIdx < data.length - 1) focusCell(data[rowIdx + 1].id, fIdx);
    }
  }

  function focusCell(id: string, fIdx: number) {
    const el = document.querySelector(`[data-cell="${id}-${fIdx}"]`) as HTMLElement | null;
    el?.focus();
  }

  /* ——— 图片加载错误 ——— */
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  function markImgError(id: string) { setImgErrors((s) => new Set([...s, id])); }

  /* ——— 保存 / 放弃 ——— */
  const completeRows = data.filter((p) => { const e = edits.get(p.id); return e && isComplete(e); });

  function handleSave() {
    onSaveRows(completeRows.map((p) => {
      const e = edits.get(p.id)!;
      return {
        id: p.id,
        patternCode: e.patternCode.trim(),
        name: e.name.trim(),
        category: e.category,
        bulkPrice: Number(e.bulkPrice),
        dropshipPrice: Number(e.dropshipPrice) || 0,
        currency: e.currency,
        packWeight: e.packWeight.trim(),
        packSize: e.packSize.trim(),
      };
    }));
  }

  function handleDiscard(ids: string[]) {
    if (!confirm(`确认放弃 ${ids.length} 条待补全记录？`)) return;
    onDiscardRows(ids);
  }

  /* ——— 空状态 ——— */
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <div className="text-5xl mb-4">✅</div>
        <p className="text-sm font-medium">暂无待补全的记录</p>
        <p className="text-xs mt-1.5 text-center leading-relaxed max-w-xs">
          使用「批量导入图片」时，勾选"为未匹配 SKU 创建待补全记录"，<br />
          未录入的 SKU 将带着图片出现在这里等待填写。
        </p>
      </div>
    );
  }

  const total = data.length;
  const done = completeRows.length;

  return (
    <div className="flex flex-col gap-3">

      {/* ——— 状态栏 ——— */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm font-semibold text-amber-800">待补全 {total} 条</span>
            <span className="text-xs text-green-700 font-medium ml-2">已完成 {done} 条</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-28 h-2 bg-amber-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => handleDiscard(Array.from(selectedIds))}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-md hover:bg-red-50"
            >
              删除选中 ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={done === 0}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
              done > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            保存已完成 {done > 0 ? `(${done})` : ''}
          </button>
        </div>
      </div>

      {/* ——— 批量填入栏（选中行后显示，深灰底避免高饱和刺眼） ——— */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-[#1a1a1a] rounded-lg shadow-md border border-white/10">
          {/* 标题 */}
          <span className="flex items-center gap-2 text-sm font-bold text-white whitespace-nowrap shrink-0">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-neutral-900 text-xs font-black">
              {selectedIds.size}
            </span>
            行 批量填入：
          </span>

          {/* 各字段输入 */}
          {BATCH_COLS.map((col) => (
            <div key={col.field} className="flex items-center gap-1.5 min-w-0">
              <span className={[
                'text-xs font-semibold whitespace-nowrap shrink-0',
                col.required ? 'text-amber-300' : 'text-zinc-400',
              ].join(' ')}>
                {col.label}{col.required ? ' *' : ''}
              </span>
              <input
                type={col.type === 'select' ? 'text' : col.type}
                value={batchBar[col.field] ?? ''}
                placeholder={col.placeholder}
                onChange={(e) => setBatchBar((b) => ({ ...b, [col.field]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { applyBatchField(col.field, (e.target as HTMLInputElement).value); }
                  if (e.key === 'Escape') setBatchBar({});
                }}
                className="w-28 px-2 py-1 text-xs border-2 border-zinc-500 rounded-md focus:outline-none focus:border-white focus:ring-2 focus:ring-white/30 bg-white text-gray-800 placeholder-gray-400"
              />
            </div>
          ))}

          {/* 应用按钮 */}
          <button
            onClick={applyAllBatchFields}
            className="px-4 py-1.5 text-sm bg-white text-neutral-900 rounded-md hover:bg-zinc-100 font-bold whitespace-nowrap shadow-sm transition-colors"
          >
            ✓ 全部应用
          </button>

          {/* 快捷提示 */}
          <span className="text-xs text-zinc-500 hidden sm:inline">
            单字段 Enter 应用 · Esc 清空
          </span>
        </div>
      )}

      {/* ——— 电子表格 ——— */}
      <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto bg-white">
        <table className="w-full text-sm" style={{ minWidth: 1100 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="w-8 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                  onChange={() => toggleAll(!allChecked)}
                  className="w-3.5 h-3.5 cursor-pointer"
                />
              </th>
              <th className="w-14 px-2 py-2.5 text-left text-xs font-medium text-gray-500">主图</th>
              <th className="w-52 px-2 py-2.5 text-left text-xs font-medium text-gray-500">SKU</th>
              <th className="w-20 px-2 py-2.5 text-left text-xs font-medium text-gray-500">颜色</th>
              {COL_CFG.map((col) => (
                <th key={col.field} className={`${col.width} px-2 py-2.5 text-left text-xs font-medium`}>
                  <span className={col.required ? 'text-red-500' : 'text-gray-500'}>
                    {col.label}{col.required ? ' *' : ''}
                  </span>
                </th>
              ))}
              <th className="w-8 px-2 py-2.5"></th>
            </tr>
          </thead>

          <tbody>
            {data.map((product, rowIdx) => {
              const e = edits.get(product.id) ?? toEdit(product);
              const rowDone = isComplete(e);
              const isSel = selectedIds.has(product.id);

              /* 主图 */
              const primaryImg = product.imageUrl && !imgErrors.has(product.id)
                ? product.imageUrl
                : (() => {
                    if (!product.productImagesByColor) return null;
                    const firstKey = Object.keys(product.productImagesByColor)[0];
                    const firstImg = firstKey ? product.productImagesByColor[firstKey]?.[0] : undefined;
                    return firstImg && !imgErrors.has(product.id + '-fallback') ? firstImg : null;
                  })();

              const colorLabel =
                product.skus[0]?.colorPhrase ??
                product.skus[0]?.colorCode ??
                product.colors[0] ?? '—';

              const rowCls = [
                'border-b border-gray-100 last:border-0 transition-colors group',
                rowDone ? 'bg-green-50' : '',
                isSel && !rowDone ? 'bg-blue-50/50' : '',
              ].join(' ');

              return (
                <tr key={product.id} className={rowCls} data-pr={rowIdx}>

                  {/* 勾选 */}
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleRow(product.id)}
                      className="w-3.5 h-3.5 cursor-pointer"
                    />
                  </td>

                  {/* 主图（可拖拽选行） */}
                  <td
                    className="px-2 py-1.5 cursor-pointer select-none"
                    onClick={(ev) => handleSafeClick(ev, rowIdx, product.id)}
                    onMouseDown={(ev) => startDragSelect(ev, rowIdx)}
                    title="点击选中行 · Shift+点击区间选 · Ctrl+点击多选 · 拖拽框选"
                  >
                    {primaryImg ? (
                      <img
                        src={primaryImg}
                        alt=""
                        className="w-11 h-11 object-cover rounded-md border border-gray-200 bg-gray-100 pointer-events-none"
                        onError={() => markImgError(product.id)}
                      />
                    ) : (
                      <div className="w-11 h-11 bg-gray-100 rounded-md border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-[10px] leading-tight text-center pointer-events-none">
                        无图
                      </div>
                    )}
                  </td>

                  {/* SKU（可拖拽选行） */}
                  <td
                    className="px-2 py-1.5 cursor-pointer select-none"
                    onClick={(ev) => handleSafeClick(ev, rowIdx, product.id)}
                    onMouseDown={(ev) => startDragSelect(ev, rowIdx)}
                  >
                    <span className="text-xs font-mono text-gray-700 block truncate w-44" title={product.skus[0]?.skuCode}>
                      {product.skus[0]?.skuCode ?? '—'}
                    </span>
                    {product.skus.length > 1 && (
                      <span className="text-[10px] text-gray-400">+{product.skus.length - 1}</span>
                    )}
                  </td>

                  {/* 颜色（可拖拽选行） */}
                  <td
                    className="px-2 py-1.5 cursor-pointer select-none"
                    onClick={(ev) => handleSafeClick(ev, rowIdx, product.id)}
                    onMouseDown={(ev) => startDragSelect(ev, rowIdx)}
                  >
                    <span className="text-xs text-gray-600">{colorLabel}</span>
                  </td>

                  {/* 可填写列 */}
                  {COL_CFG.map((col, fIdx) => {
                    const value = (e as unknown as Record<string, string>)[col.field] ?? '';
                    const isEmpty = value.trim() === '' || (col.field === 'bulkPrice' && Number(value) <= 0);
                    const needsHighlight = col.required && isEmpty;

                    /* 拖拽区间内高亮 */
                    const isDragTarget =
                      dragVisual !== null &&
                      dragVisual.fIdx === fIdx &&
                      rowIdx > dragVisual.from &&
                      rowIdx <= dragVisual.to;

                    const isFocused = focusedCell?.rowIdx === rowIdx && focusedCell?.fIdx === fIdx;

                    return (
                      <td
                        key={col.field}
                        className={[
                          'relative px-1 py-1',
                          isDragTarget ? 'ring-2 ring-blue-400 ring-inset bg-blue-50' : '',
                        ].join(' ')}
                      >
                        {col.type === 'select' ? (
                          <select
                            data-cell={`${product.id}-${fIdx}`}
                            value={value}
                            onChange={(ev) => set(product.id, col.field, ev.target.value)}
                            onKeyDown={(ev) => handleKeyDown(ev as unknown as React.KeyboardEvent<HTMLInputElement>, rowIdx, fIdx)}
                            onFocus={() => setFocusedCell({ rowIdx, fIdx })}
                            className={`${inputBase} pr-1`}
                          >
                            {col.options!.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            data-cell={`${product.id}-${fIdx}`}
                            type={col.type}
                            min={col.type === 'number' ? 0 : undefined}
                            step={col.type === 'number' ? 0.01 : undefined}
                            value={value}
                            placeholder={col.placeholder}
                            onChange={(ev) => set(product.id, col.field, ev.target.value)}
                            onKeyDown={(ev) => handleKeyDown(ev, rowIdx, fIdx)}
                            onFocus={() => setFocusedCell({ rowIdx, fIdx })}
                            className={needsHighlight ? inputRequired : inputBase}
                          />
                        )}

                        {/* 下拉填充柄：仅在该格获得焦点且有值时显示 */}
                        {isFocused && value.trim() !== '' && col.type !== 'select' && (
                          <div
                            title="向下拖拽填充"
                            className="absolute z-20 w-3 h-3 bg-blue-500 border border-white cursor-crosshair rounded-sm"
                            style={{ bottom: -1, right: -1 }}
                            onMouseDown={(ev) => startDragFill(ev, rowIdx, fIdx, value)}
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* 完成标识 / 删除 */}
                  <td className="px-2 py-1.5 text-center">
                    {rowDone ? (
                      <span className="text-green-500 font-bold text-base" title="已填写完整">✓</span>
                    ) : (
                      <button
                        onClick={() => handleDiscard([product.id])}
                        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none opacity-0 group-hover:opacity-100"
                        title="放弃此记录"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ——— 底部提示 ——— */}
      <p className="text-xs text-gray-400 px-1">
        提示：<b>Tab/Shift+Tab</b> 横向 · <b>Enter</b> 向下 ·
        <b>单元格右下角蓝色小柄</b>下拖填充 ·
        点击<b>主图/SKU/颜色</b>列选行（<b>Shift</b> 区间 · <b>Ctrl</b> 多选 · <b>拖拽</b>框选） ·
        选中后顶部深色栏批量填入
      </p>
    </div>
  );
}
