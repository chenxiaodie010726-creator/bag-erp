/* ============================================================
 * 产品数据表格组件（支持展开 SKU 子表）
 * 说明: 参照设计稿的列表视图，支持勾选、排序、展开/收起
 * ============================================================ */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import type { ProductListItem } from './mockData';
import ColorDots from './ColorDots';
import SkuSubTable from './SkuSubTable';

interface ProductTableProps {
  data: ProductListItem[];
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  highlightTerms?: string[];
  onRequestAddSku: (productId: string) => void;
  onBulkDeleteSkus: (productId: string, skuIds: string[]) => void;
  onBulkModifySkus: (productId: string, skuIds: string[], oldText: string, newText: string) => void;
  onUpdateSku: (productId: string, skuId: string, patch: Partial<ProductListItem['skus'][number]>) => void;
  onEditProduct: (product: ProductListItem) => void;
}

function PlaceholderImage() {
  return (
    <div className="w-14 h-14 bg-gray-100 rounded-md flex items-center justify-center text-gray-300 text-lg shrink-0">
      👜
    </div>
  );
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

function SortArrow({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (field !== sortField) return <span className="text-gray-300 ml-0.5">↕</span>;
  return <span className="text-gray-600 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

/** 双击行跳转详情时，忽略按钮/输入等交互元素 */
function isInteractiveDetailBlocker(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('button, a, input, textarea, select, label');
}

export default function ProductTable({
  data,
  selectedIds,
  onToggleItem,
  onToggleAll,
  sortField,
  sortDir,
  onSort,
  highlightTerms = [],
  onRequestAddSku,
  onBulkDeleteSkus,
  onBulkModifySkus,
  onUpdateSku,
  onEditProduct,
}: ProductTableProps) {
  const router = useRouter();
  const { showPrice } = useAuth();
  const allChecked = data.length > 0 && data.every((p) => selectedIds.has(p.id));
  const someChecked = data.some((p) => selectedIds.has(p.id));

  /* 管理展开状态 */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (highlightTerms.length === 0) return;
    const terms = highlightTerms.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (terms.length === 0) return;

    /*
     * 只有当搜索词「专门」命中 SKU（而非产品款号/名称）时才自动展开。
     * 避免搜索产品款号时把所有行都展开。
     */
    const shouldExpandIds = data
      .filter((product) => {
        const skuOnlyTerms = terms.filter(
          (t) =>
            !product.patternCode.toLowerCase().includes(t) &&
            !product.name.toLowerCase().includes(t)
        );
        return skuOnlyTerms.length > 0 && product.skus.some((sku) =>
          skuOnlyTerms.some(
            (term) =>
              sku.skuName.toLowerCase().includes(term) ||
              sku.skuCode.toLowerCase().includes(term)
          )
        );
      })
      .map((p) => p.id);

    if (shouldExpandIds.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      shouldExpandIds.forEach((id) => next.add(id));
      return next;
    });
  }, [data, highlightTerms]);

  const thCls = 'px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap select-none';
  const tdCls = 'px-3 py-3 text-sm text-gray-700 whitespace-nowrap';
  const sortableCls = 'cursor-pointer hover:text-gray-700 transition-colors';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`${thCls} w-10`}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                onChange={() => onToggleAll(!allChecked)}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
            </th>
            <th className={`${thCls} w-16`}>图片</th>
            <th className={`${thCls} ${sortableCls}`} onClick={() => onSort('patternCode')}>
              纸格款号 <SortArrow field="patternCode" sortField={sortField} sortDir={sortDir} />
            </th>
            <th
              className={`${thCls} ${sortableCls}`}
              onClick={() => onSort('name')}
              title="内部款式名称（与纸格款号同属一款）；与订单 Style Name（按 SKU）不同"
            >
              产品名称 <SortArrow field="name" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={thCls}>颜色</th>
            {showPrice && (
              <th className={`${thCls} ${sortableCls} text-right`} onClick={() => onSort('bulkPrice')}>
                大货价 <SortArrow field="bulkPrice" sortField={sortField} sortDir={sortDir} />
              </th>
            )}
            {showPrice && (
              <th className={`${thCls} ${sortableCls} text-right`} onClick={() => onSort('dropshipPrice')}>
                一件代发价 <SortArrow field="dropshipPrice" sortField={sortField} sortDir={sortDir} />
              </th>
            )}
            <th className={thCls}>采购币种</th>
            <th className={thCls}>包装重量</th>
            <th className={thCls}>包装尺寸</th>
            <th className={`${thCls} ${sortableCls}`} onClick={() => onSort('createdAt')}>
              创建日期 <SortArrow field="createdAt" sortField={sortField} sortDir={sortDir} />
            </th>
            <th className={thCls}>状态</th>
            <th className={`${thCls} w-16`}>操作</th>
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={showPrice ? 13 : 11} className="py-16 text-center text-gray-400">
                <div className="text-4xl mb-3">📦</div>
                <p className="text-sm">没有符合条件的产品</p>
              </td>
            </tr>
          ) : (
            data.map((product) => {
              const isSelected = selectedIds.has(product.id);
              const isExpanded = expandedIds.has(product.id);

              /* 产品行高亮：搜索词命中款号或产品名称 */
              const normalizedTerms = highlightTerms.map((t) => t.trim().toLowerCase()).filter(Boolean);
              const isProductHighlighted = normalizedTerms.length > 0 && normalizedTerms.some(
                (t) =>
                  product.patternCode.toLowerCase().includes(t) ||
                  product.name.toLowerCase().includes(t)
              );

              /*
               * 只有当搜索词「不匹配」该产品的款号/名称时，才将其传给 SkuSubTable 高亮 SKU 行。
               * 例如搜 "FANNY-2024-22" → 命中产品行，SKU 行不高亮；
               * 搜 "BLK" → 不命中任何产品，只高亮对应 SKU 行。
               */
              const skuHighlightTerms = normalizedTerms.filter(
                (t) =>
                  !product.patternCode.toLowerCase().includes(t) &&
                  !product.name.toLowerCase().includes(t)
              );

              return [
                  <tr
                    key={product.id}
                    className={[
                      'border-b border-gray-100 transition-colors',
                      isSelected
                        ? 'bg-blue-50/40'
                        : isProductHighlighted
                          ? 'bg-amber-50 ring-1 ring-inset ring-amber-200'
                          : 'hover:bg-gray-50/50',
                    ].join(' ')}
                    onDoubleClick={(e) => {
                      if (isInteractiveDetailBlocker(e.target)) return;
                      router.push(`/products/${product.id}`);
                    }}
                  >
                    {/* 勾选 */}
                    <td className={`${tdCls} w-10`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleItem(product.id)}
                        className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                      />
                    </td>

                    {/* 图片 */}
                    <td className={`${tdCls} w-16`}>
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-14 h-14 object-cover rounded-md bg-gray-100"
                        />
                      ) : (
                        <PlaceholderImage />
                      )}
                    </td>

                    {/* 纸格款号 */}
                    <td className={tdCls}>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{product.patternCode}</span>
                        <button
                          className="text-xs text-blue-500 hover:text-blue-700 text-left w-fit"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(product.patternCode);
                          }}
                        >
                          复制
                        </button>
                      </div>
                    </td>

                    {/* 产品名称 */}
                    <td className={tdCls}>{product.name}</td>

                    {/* 颜色 + 展开按钮 */}
                    <td className={tdCls}>
                      <div className="flex items-start gap-2">
                        <ColorDots colors={product.colors} skus={product.skus} maxShow={5} />
                        <button
                          type="button"
                          onClick={() => toggleExpand(product.id)}
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
                    {showPrice && (
                      <td className={`${tdCls} text-right font-mono`}>
                        ${product.bulkPrice.toFixed(2)}
                      </td>
                    )}

                    {/* 一件代发价 */}
                    {showPrice && (
                      <td className={`${tdCls} text-right font-mono`}>
                        ${product.dropshipPrice.toFixed(2)}
                      </td>
                    )}

                    {/* 采购币种 */}
                    <td className={tdCls}>
                      <span title={product.currency} className="font-medium text-gray-700">
                        {CURRENCY_SYMBOL[product.currency] ?? product.currency}
                      </span>
                    </td>

                    {/* 包装重量 */}
                    <td className={tdCls}>{product.packWeight}</td>

                    {/* 包装尺寸 */}
                    <td className={tdCls}>{product.packSize.replace(/×/g, '*')}</td>

                    {/* 创建日期 */}
                    <td className={tdCls}>{product.createdAt}</td>

                    {/* 状态 */}
                    <td className={tdCls}>
                      <div className="flex flex-col gap-1">
                        {product.status === 'active' ? (
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
                        {/* 待补全 / 部分未补全 辅助徽标 */}
                        {(!product.patternCode.trim() || !product.name.trim()) ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            待补全
                          </span>
                        ) : (
                          product.patternCode.trim() && product.name.trim() && product.bulkPrice > 0 &&
                          (!product.packWeight.trim() || !product.packSize.trim())
                        ) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            部分未补全
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 操作 */}
                    <td className={`${tdCls} w-16`}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEditProduct(product)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="编辑"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditProduct(product)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="更多操作"
                        >
                          ···
                        </button>
                      </div>
                    </td>
                  </tr>,

                  /* === 展开的 SKU 子表 === */
                      isExpanded && (
                    <tr key={`${product.id}-expanded`}>
                      <td colSpan={showPrice ? 13 : 11} className="p-0">
                            <SkuSubTable
                              productId={product.id}
                              skus={product.skus}
                              skuCount={product.skuCount}
                              imagesByColor={product.productImagesByColor}
                              highlightTerms={skuHighlightTerms}
                              onRequestAddSku={onRequestAddSku}
                              onBulkDeleteSkus={onBulkDeleteSkus}
                              onBulkModifySkus={onBulkModifySkus}
                              onUpdateSku={onUpdateSku}
                            />
                      </td>
                    </tr>
                  ),
                ];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
