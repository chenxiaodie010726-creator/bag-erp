'use client';

/* ============================================================
 * 待补全 · 疑似套装
 * 规则：SKU 第一个 "-" 后数字 ≥2；需填多个纸格款号，大货/代发可填总额或按件
 * 若某件「核对 SKU」已在库且有大货价，则显示系统参考价
 * ============================================================ */

import { useState, useEffect } from 'react';
import type { ProductListItem } from './mockData';
import { CATEGORY_OPTIONS } from './mockData';
import { parseSetPieceCountFromSku } from '@/lib/skuSetPieceCount';

const CATEGORIES = CATEGORY_OPTIONS.filter((c) => c !== '全部');
const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];

export interface SuspectedSetRowSave {
  id: string;
  patternCodes: string[];
  name: string;
  category: string;
  bulkPrice: number;
  dropshipPrice: number;
  currency: string;
  packWeight: string;
  packSize: string;
  setPieceCount: number;
  childSkuLookups: string[];
  pieceBulk: number[];
  pieceDropship: number[];
}

interface SetRowEdit {
  patternCodes: string[];
  childSkuLookups: string[];
  name: string;
  totalBulk: string;
  totalDropship: string;
  pieceBulk: string[];
  pieceDropship: string[];
  packWeight: string;
  packSize: string;
  category: string;
  currency: string;
}

interface SuspectedSetPendingViewProps {
  data: ProductListItem[];
  /** 全量产品（用于按 SKU 匹配已建档价格；会排除本条 id） */
  allProducts: ProductListItem[];
  onSaveRows: (rows: SuspectedSetRowSave[]) => void;
  onDiscardRows: (ids: string[]) => void;
}

function pieceCountForProduct(p: ProductListItem): number {
  const code = p.skus[0]?.skuCode ?? p.skus[0]?.skuName ?? '';
  return parseSetPieceCountFromSku(code) ?? 2;
}

function initPatternCodes(p: ProductListItem, n: number): string[] {
  if (p.patternCodesMulti && p.patternCodesMulti.length === n) {
    return p.patternCodesMulti.map((c) => c ?? '');
  }
  if (p.patternCode.includes(' · ')) {
    const parts = p.patternCode.split(' · ').map((s) => s.trim()).filter(Boolean);
    if (parts.length === n) return parts;
  }
  return Array.from({ length: n }, () => '');
}

function toEdit(p: ProductListItem): SetRowEdit {
  const n = pieceCountForProduct(p);
  const pieceBulk = Array.from({ length: n }, (_, i) =>
    p.setPiecePrices?.[i]?.bulk != null && p.setPiecePrices![i]!.bulk > 0
      ? String(p.setPiecePrices![i]!.bulk)
      : ''
  );
  const pieceDropship = Array.from({ length: n }, (_, i) =>
    p.setPiecePrices?.[i]?.dropship != null && p.setPiecePrices![i]!.dropship > 0
      ? String(p.setPiecePrices![i]!.dropship)
      : ''
  );
  const sumB = pieceBulk.reduce((s, x) => s + (Number(x) || 0), 0);
  const sumD = pieceDropship.reduce((s, x) => s + (Number(x) || 0), 0);
  return {
    patternCodes: initPatternCodes(p, n),
    childSkuLookups: Array.from({ length: n }, (_, i) => p.setChildSkuLookups?.[i] ?? ''),
    name: p.name ?? '',
    totalBulk: sumB > 0 ? '' : p.bulkPrice > 0 ? String(p.bulkPrice) : '',
    totalDropship: sumD > 0 ? '' : p.dropshipPrice > 0 ? String(p.dropshipPrice) : '',
    pieceBulk,
    pieceDropship,
    packWeight: p.packWeight || '',
    packSize: p.packSize || '',
    category: p.category || '手袋',
    currency: p.currency || 'USD',
  };
}

function resolvedBulk(e: SetRowEdit): number {
  const sum = e.pieceBulk.reduce((s, x) => s + (Number(x) || 0), 0);
  if (sum > 0) return sum;
  return Number(e.totalBulk) || 0;
}

function resolvedDropship(e: SetRowEdit): number {
  const sum = e.pieceDropship.reduce((s, x) => s + (Number(x) || 0), 0);
  if (sum > 0) return sum;
  return Number(e.totalDropship) || 0;
}

function isComplete(e: SetRowEdit): boolean {
  if (!e.name.trim()) return false;
  if (!e.patternCodes.every((c) => c.trim())) return false;
  return resolvedBulk(e) > 0;
}

function lookupSystemPrice(
  allProducts: ProductListItem[],
  excludeId: string,
  skuInput: string
): { bulkPrice: number; dropshipPrice: number; patternCode: string } | null {
  const k = skuInput.trim().toLowerCase();
  if (!k) return null;
  for (const p of allProducts) {
    if (p.id === excludeId) continue;
    if (!p.patternCode.trim() || !p.name.trim()) continue;
    for (const sku of p.skus) {
      if (sku.skuCode.toLowerCase() === k || sku.skuName.toLowerCase() === k) {
        const bp = sku.bulkPrice > 0 ? sku.bulkPrice : p.bulkPrice;
        const dp = sku.dropshipPrice > 0 ? sku.dropshipPrice : p.dropshipPrice;
        if (bp <= 0) continue;
        return { bulkPrice: bp, dropshipPrice: dp, patternCode: p.patternCode };
      }
    }
  }
  return null;
}

const inputBase =
  'w-full px-2 py-1 text-xs bg-transparent border-0 border-b border-gray-200 focus:border-violet-400 focus:outline-none focus:bg-violet-50/30 rounded-t-sm';
const inputRequired =
  'w-full px-2 py-1 text-xs bg-transparent border-0 border-b-2 border-red-300 focus:border-violet-400 focus:outline-none focus:bg-violet-50/30 rounded-t-sm placeholder-red-300';

export default function SuspectedSetPendingView({
  data,
  allProducts,
  onSaveRows,
  onDiscardRows,
}: SuspectedSetPendingViewProps) {
  const [edits, setEdits] = useState<Map<string, SetRowEdit>>(() => {
    const m = new Map<string, SetRowEdit>();
    for (const p of data) m.set(p.id, toEdit(p));
    return m;
  });

  useEffect(() => {
    setEdits((prev) => {
      const next = new Map(prev);
      for (const p of data) {
        if (!next.has(p.id)) next.set(p.id, toEdit(p));
      }
      for (const id of next.keys()) {
        if (!data.find((p) => p.id === id)) next.delete(id);
      }
      return next;
    });
  }, [data]);

  function setRow(id: string, patch: Partial<SetRowEdit>) {
    setEdits((prev) => {
      const n = new Map(prev);
      const base = n.get(id) ?? toEdit(data.find((p) => p.id === id)!);
      n.set(id, { ...base, ...patch });
      return n;
    });
  }

  function setPattern(id: string, idx: number, value: string) {
    const e = edits.get(id) ?? toEdit(data.find((p) => p.id === id)!);
    const pc = [...e.patternCodes];
    pc[idx] = value;
    setRow(id, { patternCodes: pc });
  }

  function setChildSku(id: string, idx: number, value: string) {
    const e = edits.get(id) ?? toEdit(data.find((p) => p.id === id)!);
    const arr = [...e.childSkuLookups];
    arr[idx] = value;
    setRow(id, { childSkuLookups: arr });
  }

  function setPieceField(
    id: string,
    field: 'pieceBulk' | 'pieceDropship',
    idx: number,
    value: string
  ) {
    const e = edits.get(id) ?? toEdit(data.find((p) => p.id === id)!);
    const arr = [...e[field]];
    arr[idx] = value;
    setRow(id, { [field]: arr });
  }

  function distributeTotals(id: string) {
    const p = data.find((x) => x.id === id);
    if (!p) return;
    const e = edits.get(id) ?? toEdit(p);
    const n = pieceCountForProduct(p);
    const tb = Number(e.totalBulk) || 0;
    const td = Number(e.totalDropship) || 0;
    if (tb <= 0 && td <= 0) return;
    const perB = n > 0 ? (tb / n).toFixed(2) : '';
    const perD = n > 0 ? (td / n).toFixed(2) : '';
    setRow(id, {
      pieceBulk: Array.from({ length: n }, () => perB),
      pieceDropship: Array.from({ length: n }, () => perD),
    });
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allChecked = data.length > 0 && data.every((p) => selectedIds.has(p.id));
  const someChecked = data.some((p) => selectedIds.has(p.id));
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll(on: boolean) {
    setSelectedIds(on ? new Set(data.map((p) => p.id)) : new Set());
  }

  const completeRows = data.filter((p) => {
    const e = edits.get(p.id);
    return e && isComplete(e);
  });

  function handleSave() {
    onSaveRows(
      completeRows.map((p) => {
        const e = edits.get(p.id)!;
        const n = pieceCountForProduct(p);
        return {
          id: p.id,
          patternCodes: e.patternCodes.map((c) => c.trim()),
          name: e.name.trim(),
          category: e.category,
          bulkPrice: resolvedBulk(e),
          dropshipPrice: resolvedDropship(e),
          currency: e.currency,
          packWeight: e.packWeight.trim(),
          packSize: e.packSize.trim(),
          setPieceCount: n,
          childSkuLookups: Array.from({ length: n }, (_, i) => (e.childSkuLookups[i] ?? '').trim()),
          pieceBulk: Array.from({ length: n }, (_, i) => Number(e.pieceBulk[i]) || 0),
          pieceDropship: Array.from({ length: n }, (_, i) => Number(e.pieceDropship[i]) || 0),
        };
      })
    );
  }

  function handleDiscard(ids: string[]) {
    if (!confirm(`确认放弃 ${ids.length} 条疑似套装待补全记录？`)) return;
    onDiscardRows(ids);
  }

  function getLookup(excludeId: string, sku: string) {
    return lookupSystemPrice(allProducts, excludeId, sku);
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <div className="text-5xl mb-4">📦</div>
        <p className="text-sm font-medium">暂无疑似套装待补全</p>
        <p className="text-xs mt-1.5 text-center leading-relaxed max-w-md">
          当导入的 SKU 在第一个「-」后为 2、3…（两件套、三件套等）时，记录会出现在此处。
          <br />
          单品（数字为 1）仍在「待补全」中处理。
        </p>
      </div>
    );
  }

  const total = data.length;
  const done = completeRows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-lg">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm font-semibold text-violet-900">待补全 · 疑似套装 {total} 条</span>
            <span className="text-xs text-green-700 font-medium ml-2">可保存 {done} 条</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-28 h-2 bg-violet-100 rounded-full overflow-hidden">
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
              type="button"
              onClick={() => handleDiscard(Array.from(selectedIds))}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-md hover:bg-red-50"
            >
              删除选中 ({selectedIds.size})
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={done === 0}
            className={[
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
              done > 0 ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            保存已完成 {done > 0 ? `(${done})` : ''}
          </button>
        </div>
      </div>

      <p className="text-xs text-violet-800/90 px-1 leading-relaxed">
        说明：请为每件各填一个纸格款号；大货价/代发价可只填<strong>套装总价</strong>，或展开按件填写（按件优先汇总）。
        在「核对 SKU」中输入已在系统中建档的单件 SKU，可显示<strong>系统参考大货价</strong>（仅供参考）。
      </p>

      <div className="space-y-4">
        {data.map((product) => {
          const e = edits.get(product.id) ?? toEdit(product);
          const n = pieceCountForProduct(product);
          const rowOk = isComplete(e);
          const skuMain = product.skus[0]?.skuCode ?? '—';
          const colorLabel =
            product.skus[0]?.colorPhrase ?? product.skus[0]?.colorCode ?? product.colors[0] ?? '—';
          const primaryImg = product.imageUrl ?? product.productImagesByColor?.[product.colors[0] ?? '']?.[0];

          return (
            <div
              key={product.id}
              className={[
                'border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm',
                rowOk ? 'ring-2 ring-green-200' : '',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start gap-3 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                <input
                  type="checkbox"
                  checked={selectedIds.has(product.id)}
                  onChange={() => toggleRow(product.id)}
                  className="w-3.5 h-3.5 mt-1"
                />
                <div className="w-14 h-14 shrink-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                  {primaryImg ? (
                    <img src={primaryImg} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">无图</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                      {n} 件套
                    </span>
                    <span className="text-xs font-mono text-gray-800 truncate block max-w-full" title={skuMain}>
                      {skuMain}
                    </span>
                    <span className="text-xs text-gray-500">{colorLabel}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">套装 SKU（客户编码规则：首段横杠后数字为件数）</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDiscard([product.id])}
                  className="text-xs text-gray-400 hover:text-red-500 shrink-0"
                >
                  放弃
                </button>
              </div>

              <div className="p-3 overflow-x-auto">
                <table className="w-full text-xs min-w-[720px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-1.5 pr-2 w-8">#</th>
                      <th className="py-1.5 pr-2">纸格款号 *</th>
                      <th className="py-1.5 pr-2 w-44">核对 SKU（选填）</th>
                      <th className="py-1.5 pr-2 w-40">系统参考大货价</th>
                      <th className="py-1.5 pr-2 w-24">按件大货价</th>
                      <th className="py-1.5 w-24">按件代发价</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: n }, (_, idx) => {
                      const hint = getLookup(product.id, e.childSkuLookups[idx] ?? '');
                      return (
                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 align-top text-gray-400">{idx + 1}</td>
                          <td className="py-1.5 pr-2 align-top">
                            <input
                              type="text"
                              value={e.patternCodes[idx] ?? ''}
                              placeholder={`第 ${idx + 1} 件纸格款号`}
                              onChange={(ev) => setPattern(product.id, idx, ev.target.value)}
                              className={!(e.patternCodes[idx] ?? '').trim() ? inputRequired : inputBase}
                            />
                          </td>
                          <td className="py-1.5 pr-2 align-top">
                            <input
                              type="text"
                              value={e.childSkuLookups[idx] ?? ''}
                              placeholder="输入已建档单件 SKU"
                              onChange={(ev) => setChildSku(product.id, idx, ev.target.value)}
                              className={inputBase}
                            />
                          </td>
                          <td className="py-1.5 pr-2 align-top">
                            {hint ? (
                              <span className="inline-flex flex-wrap items-center gap-1">
                                <span className="font-mono text-gray-800">${hint.bulkPrice.toFixed(2)}</span>
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  title={hint.patternCode}
                                >
                                  系统
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 align-top">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={e.pieceBulk[idx] ?? ''}
                              onChange={(ev) => setPieceField(product.id, 'pieceBulk', idx, ev.target.value)}
                              className={inputBase}
                              placeholder="—"
                            />
                          </td>
                          <td className="py-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={e.pieceDropship[idx] ?? ''}
                              onChange={(ev) => setPieceField(product.id, 'pieceDropship', idx, ev.target.value)}
                              className={inputBase}
                              placeholder="—"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">产品名称 *</label>
                  <input
                    type="text"
                    value={e.name}
                    onChange={(ev) => setRow(product.id, { name: ev.target.value })}
                    placeholder="套装内部名称"
                    className={!e.name.trim() ? inputRequired : inputBase}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">套装大货总价（与按件二选一或混用）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={e.totalBulk}
                    onChange={(ev) => setRow(product.id, { totalBulk: ev.target.value })}
                    className={inputBase}
                    placeholder="总额"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">套装代发总价</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={e.totalDropship}
                    onChange={(ev) => setRow(product.id, { totalDropship: ev.target.value })}
                    className={inputBase}
                    placeholder="总额"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => distributeTotals(product.id)}
                    className="w-full sm:w-auto px-3 py-1.5 text-xs border border-violet-200 text-violet-700 rounded-md hover:bg-violet-50"
                  >
                    将总价平分到各件
                  </button>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">分类</label>
                  <select
                    value={e.category}
                    onChange={(ev) => setRow(product.id, { category: ev.target.value })}
                    className={inputBase}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">币种</label>
                  <select
                    value={e.currency}
                    onChange={(ev) => setRow(product.id, { currency: ev.target.value })}
                    className={inputBase}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">包装重量</label>
                  <input
                    type="text"
                    value={e.packWeight}
                    onChange={(ev) => setRow(product.id, { packWeight: ev.target.value })}
                    placeholder="如 0.5 kg"
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">包装尺寸</label>
                  <input
                    type="text"
                    value={e.packSize}
                    onChange={(ev) => setRow(product.id, { packSize: ev.target.value })}
                    placeholder="如 30×20×10"
                    className={inputBase}
                  />
                </div>
              </div>

              <div className="px-3 pb-2 text-[11px] text-gray-500 flex flex-wrap gap-3 border-t border-gray-50 pt-2">
                <span>
                  汇总大货：<b className="text-gray-800">${resolvedBulk(e).toFixed(2)}</b>
                </span>
                <span>
                  汇总代发：<b className="text-gray-800">${resolvedDropship(e).toFixed(2)}</b>
                </span>
                {rowOk ? <span className="text-green-600 font-medium">✓ 可保存</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 全选工具条 */}
      <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = !allChecked && someChecked;
          }}
          onChange={() => toggleAll(!allChecked)}
        />
        <span>全选</span>
      </div>
    </div>
  );
}
