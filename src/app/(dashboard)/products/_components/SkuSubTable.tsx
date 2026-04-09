/* ============================================================
 * SKU 子表格组件（展开行）
 * 说明: 点击产品行展开后显示该款式下所有 SKU 的详细信息
 *       参照设计稿的展开样式
 * ============================================================ */

'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import type { SkuItem } from './mockData';
import { COLOR_NAME_MAP, COLOR_NAME_ZH_MAP } from './mockData';
import { resolveHexForProductSku } from '@/lib/colorDisplay';
import { useColorRegistry } from '@/hooks/useColorRegistry';

const LIGHT_PRESET_SKU = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);
function isLightHexSku(hex: string): boolean {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  } catch { return false; }
}
function skuColorEnLabel(sku: SkuItem): string {
  if (sku.colorCode.startsWith('#')) return sku.colorCode;
  if (COLOR_NAME_MAP[sku.colorCode]) return COLOR_NAME_MAP[sku.colorCode];
  const phrase = sku.colorPhrase?.trim();
  if (phrase) return phrase;
  return sku.colorCode;
}

interface SkuSubTableProps {
  productId: string;
  skus: SkuItem[];
  skuCount: number;
  highlightTerms?: string[];
  onRequestAddSku: (productId: string) => void;
  onBulkDeleteSkus: (productId: string, skuIds: string[]) => void;
  onBulkModifySkus: (productId: string, skuIds: string[], oldText: string, newText: string) => void;
  onUpdateSku: (productId: string, skuId: string, patch: Partial<SkuItem>) => void;
}

export default function SkuSubTable({
  productId,
  skus,
  skuCount,
  highlightTerms = [],
  onRequestAddSku,
  onBulkDeleteSkus,
  onBulkModifySkus,
  onUpdateSku,
}: SkuSubTableProps) {
  const { showPrice } = useAuth();
  const colorRegistry = useColorRegistry();
  const thCls = 'px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap';
  const tdCls = 'px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap';
  const normalizedTerms = highlightTerms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(() => new Set());

  const allChecked = skus.length > 0 && skus.every((sku) => selectedSkuIds.has(sku.id));

  function toggleSkuSelect(id: string) {
    setSelectedSkuIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllSkus() {
    if (allChecked) {
      setSelectedSkuIds(new Set());
    } else {
      setSelectedSkuIds(new Set(skus.map((s) => s.id)));
    }
  }

  function handleBulkAction(action: string) {
    const ids = Array.from(selectedSkuIds);
    if (ids.length === 0) return;
    if (action === 'delete') {
      onBulkDeleteSkus(productId, ids);
      setSelectedSkuIds(new Set());
      return;
    }
    if (action === 'modify') {
      const oldText = window.prompt('请输入要替换的旧文本（留空为追加）', '') ?? '';
      const newText = window.prompt('请输入新文本', '') ?? '';
      if (!newText) return;
      onBulkModifySkus(productId, ids, oldText, newText);
      setSelectedSkuIds(new Set());
    }
  }

  return (
    <div className="bg-gray-50/70 border-t border-b border-gray-100">
      {/* SKU 表格 */}
      <div className="px-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={`${thCls} w-10`}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAllSkus}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
              </th>
              <th className={`${thCls} w-12`}>图</th>
              <th className={thCls}>SKU</th>
              <th className={thCls}>Color</th>
              <th className={thCls}>颜色</th>
              <th className={`${thCls} text-right`}>库存</th>
              {showPrice && <th className={`${thCls} text-right`}>大货价</th>}
              {showPrice && <th className={`${thCls} text-right`}>一件代发价</th>}
              <th className={thCls}>状态</th>
              <th className={thCls}>更新时间 ↕</th>
              <th className={`${thCls} w-16`}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {skus.map((sku) => {
              const hex = resolveHexForProductSku(sku, colorRegistry);
              const colorEn = skuColorEnLabel(sku);
              const colorLabelMono = sku.colorCode.startsWith('#');
              const isLight = LIGHT_PRESET_SKU.has(sku.colorCode) || isLightHexSku(hex);
              const isMatched =
                normalizedTerms.length > 0 &&
                normalizedTerms.some(
                  (term) =>
                    sku.skuName.toLowerCase().includes(term) ||
                    sku.skuCode.toLowerCase().includes(term)
                );

              return (
                <tr
                  key={sku.id}
                  className={[
                    'transition-colors',
                    isMatched
                      ? 'bg-amber-50 hover:bg-amber-100/70 ring-1 ring-inset ring-amber-200'
                      : 'hover:bg-white/60',
                  ].join(' ')}
                >
                  {/* 勾选 */}
                  <td className={tdCls}>
                    <input
                      type="checkbox"
                      checked={selectedSkuIds.has(sku.id)}
                      onChange={() => toggleSkuSelect(sku.id)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                  </td>

                  {/* 缩略图 */}
                  <td className={tdCls}>
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center text-white text-xs shrink-0"
                      style={{
                        backgroundColor: hex,
                        border: isLight ? '1px solid #d1d5db' : 'none',
                        color: isLight ? '#666' : '#fff',
                      }}
                    >
                      👜
                    </div>
                  </td>

                  {/* SKU 名称 */}
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{sku.skuName}</span>
                      {isMatched && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          命中
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Color（色块 + 英文全名；自定义 # 色值仍用等宽显示） */}
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-4 h-4 rounded-full shrink-0"
                        style={{
                          backgroundColor: hex,
                          border: isLight ? '1px solid #d1d5db' : 'none',
                        }}
                      />
                      <span
                        className={
                          colorLabelMono
                            ? 'font-mono text-xs text-gray-600'
                            : 'text-sm text-gray-700'
                        }
                      >
                        {colorEn}
                      </span>
                    </div>
                  </td>

                  {/* 颜色（中文名） */}
                  <td className={tdCls}>
                    <span className="text-sm text-gray-700">
                      {sku.colorNameZh ?? COLOR_NAME_ZH_MAP[sku.colorCode] ?? '—'}
                    </span>
                  </td>

                  {/* 库存 */}
                  <td className={`${tdCls} text-right font-mono`}>{sku.stock}</td>

                  {/* 大货价 */}
                  {showPrice && <td className={`${tdCls} text-right font-mono`}>${sku.bulkPrice.toFixed(2)}</td>}

                  {/* 一件代发价 */}
                  {showPrice && <td className={`${tdCls} text-right font-mono`}>${sku.dropshipPrice.toFixed(2)}</td>}

                  {/* 状态 */}
                  <td className={tdCls}>
                    {sku.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        停用
                      </span>
                    )}
                  </td>

                  {/* 更新时间 */}
                  <td className={tdCls}>{sku.updatedAt}</td>

                  {/* 操作 */}
                  <td className={tdCls}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const nextStatus = sku.status === 'active' ? 'discontinued' : 'active';
                          if (!window.confirm(`确认将该 SKU ${nextStatus === 'active' ? '启用' : '停用'}？`)) return;
                          onUpdateSku(productId, sku.id, {
                            status: nextStatus,
                            updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
                          });
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title={sku.status === 'active' ? '停用' : '启用'}
                      >
                        {sku.status === 'active' ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => {
                          const nextStock = window.prompt('请输入库存', String(sku.stock));
                          if (nextStock === null) return;
                          const stockNum = Number(nextStock);
                          if (!Number.isFinite(stockNum)) return;
                          onUpdateSku(productId, sku.id, {
                            stock: stockNum,
                            updatedAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
                          });
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="改库存"
                      >
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 底部操作栏 */}
      <div className="px-6 py-2.5 flex items-center gap-3 border-t border-gray-100">
        <button
          onClick={() => onRequestAddSku(productId)}
          className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
        >
          + 添加 SKU
        </button>
        <select
          value=""
          onChange={(e) => {
            handleBulkAction(e.target.value);
            e.currentTarget.value = '';
          }}
          disabled={selectedSkuIds.size === 0}
          className={[
            'text-sm border rounded px-2 py-1 transition-colors bg-white',
            selectedSkuIds.size === 0
              ? 'border-gray-100 text-gray-300 cursor-not-allowed'
              : 'border-gray-200 text-gray-600 hover:border-gray-300',
          ].join(' ')}
        >
          <option value="" disabled>批量操作 ▾</option>
          <option value="delete">批量删除</option>
          <option value="modify">批量修改 SKU</option>
        </select>
        {selectedSkuIds.size > 0 && (
          <span className="text-xs text-blue-500">已选 {selectedSkuIds.size} 项</span>
        )}
      </div>
    </div>
  );
}
