'use client';
/* ============================================================
 * 套装颜色 SKU 展开子表
 * 与 products/SkuSubTable 逻辑一致，展示每个颜色 SKU 的详情
 * ============================================================ */

import { useState } from 'react';
import type { SetSkuItem } from './mockData';
import { COLOR_MAP } from './mockData';

interface SetSkuSubTableProps {
  setId: string;
  setSku: string;
  skus: SetSkuItem[];
  bulkPrice: number;
  dropshipPrice: number;
  currencySymbol: string;
  onUpdateSkus?: (setId: string, skus: SetSkuItem[]) => void;
}

const LIGHT_PRESET = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);

function resolveHex(code: string): string {
  return COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
}
function isLight(code: string): boolean {
  if (LIGHT_PRESET.has(code)) return true;
  if (code.startsWith('#')) {
    const r = parseInt(code.slice(1, 3), 16);
    const g = parseInt(code.slice(3, 5), 16);
    const b = parseInt(code.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  }
  return false;
}

export default function SetSkuSubTable({
  setId,
  setSku,
  skus,
  bulkPrice,
  dropshipPrice,
  currencySymbol,
  onUpdateSkus,
}: SetSkuSubTableProps) {
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set());

  const allChecked = skus.length > 0 && skus.every((s) => selectedSkuIds.has(s.id));
  const someChecked = skus.some((s) => selectedSkuIds.has(s.id));

  function toggleSkuSelect(id: string) {
    setSelectedSkuIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAllSkus(selectAll: boolean) {
    setSelectedSkuIds(selectAll ? new Set(skus.map((s) => s.id)) : new Set());
  }

  function toggleSkuStatus(skuId: string) {
    if (!onUpdateSkus) return;
    onUpdateSkus(setId, skus.map((s) =>
      s.id === skuId
        ? { ...s, status: s.status === 'active' ? 'discontinued' : 'active' }
        : s
    ));
  }

  function bulkDeleteSkus() {
    if (!onUpdateSkus || selectedSkuIds.size === 0) return;
    if (!confirm(`确认删除选中的 ${selectedSkuIds.size} 个颜色 SKU？`)) return;
    onUpdateSkus(setId, skus.filter((s) => !selectedSkuIds.has(s.id)));
    setSelectedSkuIds(new Set());
  }

  const thCls = 'px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap';
  const tdCls = 'px-3 py-2.5 text-sm text-gray-700 align-middle';

  return (
    <tr>
      <td colSpan={14} className="px-0 py-0">
        <div className="bg-gray-50/70 border-y border-gray-100">
          {/* 子表工具栏 */}
          <div className="flex items-center justify-between px-6 pt-3 pb-2">
            <span className="text-xs font-semibold text-gray-400">
              {setSku} · 颜色 SKU · 共 {skus.length} 个
            </span>
            {selectedSkuIds.size > 0 && (
              <button
                type="button"
                onClick={bulkDeleteSkus}
                className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
              >
                🗑 删除选中 ({selectedSkuIds.size})
              </button>
            )}
          </div>

          {/* 子表 */}
          <div className="px-4 pb-3">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={`${thCls} w-8`}>
                    <input
                      type="checkbox"
                      ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                      checked={allChecked}
                      onChange={() => toggleAllSkus(!allChecked)}
                      className="w-3.5 h-3.5 cursor-pointer rounded border-gray-300"
                    />
                  </th>
                  <th className={`${thCls} w-10`}>图</th>
                  <th className={thCls}>SKU</th>
                  <th className={thCls}>颜色</th>
                  <th className={thCls}>颜色中文</th>
                  <th className={`${thCls} text-right`}>库存</th>
                  <th className={`${thCls} text-right`}>大货价</th>
                  <th className={`${thCls} text-right`}>一件代发价</th>
                  <th className={thCls}>状态</th>
                  <th className={thCls}>更新时间</th>
                  <th className={thCls}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {skus.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-xs text-gray-400">
                      暂无颜色 SKU，请添加
                    </td>
                  </tr>
                ) : (
                  skus.map((sku) => {
                    const hex = resolveHex(sku.colorCode);
                    const light = isLight(sku.colorCode);
                    const isChecked = selectedSkuIds.has(sku.id);

                    return (
                      <tr
                        key={sku.id}
                        className={[
                          'transition-colors',
                          isChecked ? 'bg-blue-50/40' : 'hover:bg-white/60',
                        ].join(' ')}
                      >
                        {/* 勾选 */}
                        <td className={`${tdCls} w-8`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSkuSelect(sku.id)}
                            className="w-3.5 h-3.5 cursor-pointer rounded border-gray-300"
                          />
                        </td>

                        {/* 颜色色块（作为图 */}
                        <td className={`${tdCls} w-10`}>
                          <span
                            className="inline-block w-8 h-8 rounded-md"
                            style={{
                              backgroundColor: hex,
                              border: light ? '1px solid #d1d5db' : 'none',
                            }}
                          />
                        </td>

                        {/* SKU 编号 */}
                        <td className={tdCls}>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-gray-800 text-xs whitespace-nowrap">{sku.skuCode}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(sku.skuCode)}
                              className="text-xs text-blue-400 hover:text-blue-600 text-left w-fit transition-colors"
                            >
                              复制
                            </button>
                          </div>
                        </td>

                        {/* 颜色 */}
                        <td className={tdCls}>
                          <span className="text-xs text-gray-600">{sku.colorCode}</span>
                        </td>

                        {/* 颜色中文 */}
                        <td className={tdCls}>
                          <span className="text-xs text-gray-500">{sku.colorNameZh ?? '—'}</span>
                        </td>

                        {/* 库存 */}
                        <td className={`${tdCls} text-right font-mono text-xs`}>{sku.stock}</td>

                        {/* 大货价（继承套装价格） */}
                        <td className={`${tdCls} text-right font-mono text-xs text-gray-500`}>
                          {currencySymbol}{bulkPrice.toFixed(2)}
                        </td>

                        {/* 一件代发价 */}
                        <td className={`${tdCls} text-right font-mono text-xs text-gray-500`}>
                          {currencySymbol}{dropshipPrice.toFixed(2)}
                        </td>

                        {/* 状态 */}
                        <td className={tdCls}>
                          {sku.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 启用
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> 停用
                            </span>
                          )}
                        </td>

                        {/* 更新时间 */}
                        <td className={`${tdCls} text-xs text-gray-400 whitespace-nowrap`}>{sku.updatedAt}</td>

                        {/* 操作 */}
                        <td className={tdCls}>
                          <button
                            type="button"
                            onClick={() => toggleSkuStatus(sku.id)}
                            title={sku.status === 'active' ? '停用' : '启用'}
                            className={[
                              'px-2 py-1 text-xs rounded-md border transition-colors',
                              sku.status === 'active'
                                ? 'text-gray-400 border-gray-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50'
                                : 'text-green-500 border-green-200 hover:bg-green-50',
                            ].join(' ')}
                          >
                            {sku.status === 'active' ? '停用' : '启用'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}
