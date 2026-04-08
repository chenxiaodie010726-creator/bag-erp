'use client';
/* ============================================================
 * 套装数据表格组件
 * 点击行展开 → 显示每个颜色的 SKU 子行（与 ProductTable 逻辑一致）
 * ============================================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SetItem, SetSkuItem } from './mockData';
import { COLOR_MAP, CURRENCY_SYMBOL } from './mockData';
import SetSkuSubTable from './SetSkuSubTable';

interface SetTableProps {
  data: SetItem[];
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  onEdit: (item: SetItem) => void;
  onUpdateSetSkus?: (setId: string, skus: SetSkuItem[]) => void;
  highlightTerms?: string[];
}

const COL_SPAN = 14;

function PlaceholderImage() {
  return (
    <div className="w-14 h-14 bg-gray-100 rounded-md flex items-center justify-center text-gray-300 text-xl shrink-0">
      🎁
    </div>
  );
}

function SortArrow({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (field !== sortField) return <span className="text-gray-300 ml-0.5">↕</span>;
  return <span className="text-gray-600 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function isInteractiveDetailBlocker(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('button, a, input, textarea, select, label');
}

const LIGHT_PRESET = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);

function ColorDots({ colors, maxShow = 5 }: { colors: string[]; maxShow?: number }) {
  const visible = colors.slice(0, maxShow);
  const remaining = colors.length - maxShow;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 flex-wrap">
        {visible.map((code) => {
          const hex = COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
          const isLight = LIGHT_PRESET.has(code);
          return (
            <span key={code} title={code}
              className="inline-block w-7 h-7 rounded-md shrink-0"
              style={{ backgroundColor: hex, border: isLight ? '1px solid #d1d5db' : 'none' }}
            />
          );
        })}
        {remaining > 0 && <span className="text-xs text-gray-400 ml-0.5">+{remaining}</span>}
      </div>
      <span className="text-xs text-gray-400">{colors.length} 个颜色</span>
    </div>
  );
}

export default function SetTable({
  data,
  selectedIds,
  onToggleItem,
  onToggleAll,
  sortField,
  sortDir,
  onSort,
  onEdit,
  onUpdateSetSkus,
  highlightTerms = [],
}: SetTableProps) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const allChecked = data.length > 0 && data.every((s) => selectedIds.has(s.id));
  const someChecked = data.some((s) => selectedIds.has(s.id));

  const thCls = 'px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap select-none';
  const tdCls = 'px-3 py-3 text-sm text-gray-700 align-top';
  const sortCls = 'cursor-pointer hover:text-gray-700 transition-colors';

  const normalizedTerms = highlightTerms.map((t) => t.trim().toLowerCase()).filter(Boolean);

  function isRowHighlighted(item: SetItem) {
    if (normalizedTerms.length === 0) return false;
    return normalizedTerms.some(
      (t) =>
        item.sku.toLowerCase().includes(t) ||
        item.name.toLowerCase().includes(t)
    );
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px]">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`${thCls} w-10`}>
              <input
                type="checkbox"
                ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                checked={allChecked}
                onChange={() => onToggleAll(!allChecked)}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
            </th>
            <th className={`${thCls} w-16`}>图片</th>
            <th className={`${thCls} ${sortCls}`} onClick={() => onSort('sku')}>
              套装 SKU <SortArrow field="sku" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={`${thCls} ${sortCls}`} onClick={() => onSort('name')}>
              产品名称 <SortArrow field="name" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={thCls}>纸格款号</th>
            <th className={thCls}>颜色</th>
            <th className={`${thCls} ${sortCls} text-right`} onClick={() => onSort('bulkPrice')}>
              大货价 <SortArrow field="bulkPrice" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={`${thCls} ${sortCls} text-right`} onClick={() => onSort('dropshipPrice')}>
              一件代发价 <SortArrow field="dropshipPrice" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={thCls}>采购币种</th>
            <th className={thCls}>包装重量</th>
            <th className={thCls}>包装尺寸</th>
            <th className={`${thCls} ${sortCls}`} onClick={() => onSort('createdAt')}>
              创建日期 <SortArrow field="createdAt" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={thCls}>状态</th>
            <th className={`${thCls} w-20`}>操作</th>
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={COL_SPAN} className="py-16 text-center text-gray-400">
                <div className="text-4xl mb-3">🎁</div>
                <p className="text-sm">没有符合条件的套装</p>
              </td>
            </tr>
          ) : (
            data.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isExpanded = expandedIds.has(item.id);
              const highlighted = isRowHighlighted(item);
              const sym = CURRENCY_SYMBOL[item.currency] ?? item.currency;

              return [
                /* ══ 套装主行 ══ */
                <tr
                  key={item.id}
                  className={[
                    'border-b border-gray-100 transition-colors',
                    isSelected
                      ? 'bg-blue-50/40'
                      : highlighted
                        ? 'bg-amber-50 ring-1 ring-inset ring-amber-200'
                        : 'hover:bg-gray-50/50',
                  ].join(' ')}
                  onDoubleClick={(e) => {
                    if (isInteractiveDetailBlocker(e.target)) return;
                    router.push(`/sets/${item.id}`);
                  }}
                >
                  {/* 勾选 */}
                  <td className={`${tdCls} w-10`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleItem(item.id)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                  </td>

                  {/* 图片 */}
                  <td className={`${tdCls} w-16`}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-14 h-14 object-cover rounded-md bg-gray-100" />
                      : <PlaceholderImage />}
                  </td>

                  {/* 套装 SKU */}
                  <td className={tdCls}>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 whitespace-nowrap">{item.sku}</span>
                      <button
                        type="button"
                        className="text-xs text-blue-500 hover:text-blue-700 text-left w-fit mt-0.5"
                        onClick={() => navigator.clipboard.writeText(item.sku)}
                      >
                        复制
                      </button>
                    </div>
                  </td>

                  {/* 产品名称 */}
                  <td className={tdCls}>
                    <span className="whitespace-nowrap">{item.name}</span>
                  </td>

                  {/* 纸格款号（显示组件列表，折叠状态精简展示） */}
                  <td className={tdCls}>
                    <div className="flex flex-col gap-0.5 max-w-[160px]">
                      {item.components.slice(0, 3).map((c) => (
                        <span key={c} className="flex items-center gap-1 text-xs text-gray-600">
                          <span className="text-gray-300">·</span>
                          <span className="truncate">{c}</span>
                        </span>
                      ))}
                      {item.components.length > 3 && (
                        <span className="text-xs text-gray-400">+{item.components.length - 3} 个…</span>
                      )}
                    </div>
                  </td>

                  {/* 颜色 + 展开按钮 */}
                  <td className={tdCls}>
                    <div className="flex items-start gap-2">
                      <ColorDots colors={item.colors} maxShow={4} />
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        title={isExpanded ? '收起 SKU' : '展开 SKU'}
                        className={[
                          'mt-0.5 flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0',
                          isExpanded
                            ? 'bg-gray-800 text-white border-gray-800 hover:bg-gray-600'
                            : 'text-gray-400 border-gray-200 hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        {isExpanded ? '收起' : '展开'}
                      </button>
                    </div>
                  </td>

                  {/* 大货价 */}
                  <td className={`${tdCls} text-right font-mono whitespace-nowrap`}>
                    {sym}{item.bulkPrice.toFixed(2)}
                  </td>

                  {/* 一件代发价 */}
                  <td className={`${tdCls} text-right font-mono whitespace-nowrap`}>
                    {sym}{item.dropshipPrice.toFixed(2)}
                  </td>

                  {/* 采购币种 */}
                  <td className={tdCls}>
                    <span title={item.currency} className="font-medium text-gray-700">{sym}</span>
                  </td>

                  {/* 包装重量 */}
                  <td className={tdCls}><span className="whitespace-nowrap">{item.packWeight}</span></td>

                  {/* 包装尺寸 */}
                  <td className={tdCls}><span className="whitespace-nowrap">{item.packSize.replace(/×/g, '*')}</span></td>

                  {/* 创建日期 */}
                  <td className={`${tdCls} whitespace-nowrap`}>{item.createdAt}</td>

                  {/* 状态 */}
                  <td className={tdCls}>
                    {item.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> 停用
                      </span>
                    )}
                  </td>

                  {/* 操作 */}
                  <td className={tdCls}>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="编辑"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>,

                /* ══ 展开子表：颜色 SKU 详情 ══ */
                isExpanded && (
                  <SetSkuSubTable
                    key={`${item.id}-skus`}
                    setId={item.id}
                    setSku={item.sku}
                    skus={item.skus}
                    bulkPrice={item.bulkPrice}
                    dropshipPrice={item.dropshipPrice}
                    currencySymbol={sym}
                    onUpdateSkus={onUpdateSetSkus}
                  />
                ),
              ];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
