'use client';

/* ============================================================
 * 未录入 SKU 页面
 * 展示导入订单时发现的、不在产品列表/套装列表中的 SKU
 * ============================================================ */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { UnregisteredSkuEntry } from '@/lib/orderInventorySync';
import {
  computeUnregisteredSkuEntriesFromOrders,
  dismissUnregisteredEntry,
  clearDismissedUnregisteredEntries,
  loadDismissedUnregisteredIds,
} from '@/lib/unregisteredSkuCompute';

export default function UnregisteredPage() {
  const router = useRouter();
  const [items, setItems] = useState<UnregisteredSkuEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** 递增以触发从订单重算未录入列表 */
  const [listTick, setListTick] = useState(0);

  const refreshList = useCallback(() => {
    const all = computeUnregisteredSkuEntriesFromOrders();
    const dismissed = loadDismissedUnregisteredIds();
    setItems(all.filter((e) => !dismissed.has(e.id)));
  }, []);

  useEffect(() => {
    refreshList();
  }, [listTick, refreshList]);

  /* ===== 筛选 ===== */
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.sku.toLowerCase().includes(q) ||
        i.styleName.toLowerCase().includes(q) ||
        i.poNumber.toLowerCase().includes(q) ||
        i.colorName.toLowerCase().includes(q)
    );
  }, [items, search]);

  /* ===== 分页 ===== */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => { setPage(1); }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  /* ===== 选择 ===== */
  const allPageSelected = pageItems.length > 0 && pageItems.every((i) => selectedIds.has(i.id));
  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItems.forEach((i) => next.delete(i.id));
      } else {
        pageItems.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ===== 批量忽略（本页不再显示，直至 SKU 登记或清除忽略） ===== */
  function handleDelete() {
    if (selectedIds.size === 0) return;
    selectedIds.forEach((id) => dismissUnregisteredEntry(id));
    setSelectedIds(new Set());
    setListTick((t) => t + 1);
  }

  function handleDeleteOne(id: string) {
    dismissUnregisteredEntry(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setListTick((t) => t + 1);
  }

  function handleClearDismissed() {
    if (!confirm('确定清除所有「已忽略」记录？清除后，被隐藏的未登记 SKU 会重新显示（若仍未在产品中登记）。')) return;
    clearDismissedUnregisteredEntries();
    setListTick((t) => t + 1);
  }

  /* ===== 按 PO 号分组统计 ===== */
  const poStats = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => {
      map.set(i.poNumber, (map.get(i.poNumber) ?? 0) + 1);
    });
    return map;
  }, [items]);

  return (
    <div className="flex flex-col gap-4">

      {/* ===== 面包屑 + 标题 ===== */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
            <Link href="/orders" className="hover:text-gray-600">客户订单</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">未录入 SKU</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">未录入 SKU</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            自动比对「客户订单」各单明细中的 SKU 与「产品列表 / 套装列表」；凡订单中有而库中无的 SKU 会出现在此表（与订单总览、产品列表数据联动）。
          </p>
        </div>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="未录入 SKU" value={items.length} accent="text-amber-600" bg="bg-amber-50" />
        <StatCard label="涉及订单" value={poStats.size} accent="text-blue-600" bg="bg-blue-50" />
        <StatCard
          label="总数量"
          value={items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}
          accent="text-gray-700" bg="bg-gray-50"
        />
        <StatCard
          label="总金额 (USD)"
          value={`$${items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          accent="text-red-600" bg="bg-red-50"
        />
      </div>

      {/* ===== 筛选栏 ===== */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="搜索 SKU / 款式 / PO 号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {selectedIds.size > 0 && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
          >
            <TrashIcon /> 删除已选 ({selectedIds.size})
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setSearch('');
            setListTick((t) => t + 1);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <RefreshIcon /> 刷新
        </button>
        <button
          type="button"
          onClick={handleClearDismissed}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-700 border border-violet-200 rounded-md hover:bg-violet-50 transition-colors"
          title="恢复被「删除」隐藏的未登记项"
        >
          清除忽略
        </button>
      </div>

      {/* ===== 表格 ===== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">颜色</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">款式名称</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">单价 (USD)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">数量</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">来源订单</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">发现时间</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-gray-400">
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-sm font-medium text-gray-600">当前没有待处理的未登记 SKU</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                      说明：系统已根据订单明细与产品/套装库比对。若订单里的 SKU 在产品列表搜不到，应出现在此表；
                      若仍为空，可能是该 SKU 已在套装或产品子 SKU 中登记，或订单明细尚未保存。可点击「刷新」重算。
                    </p>
                  </td>
                </tr>
              ) : (
                pageItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleOne(item.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-56">
                      <span className="truncate block">{item.sku}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{item.colorName || '—'}</td>
                    <td className="px-4 py-2 text-gray-700 font-medium">{item.styleName || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-500">
                      ${item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/orders/${item.orderId}`}
                        className="text-blue-500 hover:underline text-xs"
                      >
                        {item.poNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {new Date(item.discoveredAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const q = new URLSearchParams({
                              fromOrder: '1',
                              sku: item.sku,
                              styleName: item.styleName,
                              colorName: item.colorName,
                              unitPrice: String(item.unitPrice),
                            });
                            router.push(`/products?${q.toString()}`);
                          }}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                          title="打开新建产品：带入 SKU、颜色与单价；产品名称须自填（不会使用订单 Style Name）"
                        >
                          录入
                        </button>
                        <button
                          onClick={() => handleDeleteOne(item.id)}
                          className="text-xs text-gray-400 hover:text-red-500"
                          title="删除"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== 分页 ===== */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span>共 {filtered.length} 条</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-gray-200 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {[10, 20, 50].map((s) => <option key={s} value={s}>{s}条/页</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`el_${i}`} className="px-2 text-gray-400">…</span>
              ) : (
                <PageBtn key={p} active={page === p} onClick={() => setPage(p as number)}>{p}</PageBtn>
              )
            )}
            <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 子组件
 * ============================================================ */

function StatCard({ label, value, accent, bg }: { label: string; value: string | number; accent: string; bg: string }) {
  return (
    <div className={`${bg} border border-gray-200 rounded-lg px-4 py-3`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${accent} mt-0.5`}>{value}</p>
    </div>
  );
}

interface PageBtnProps { children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; }
function PageBtn({ children, onClick, active, disabled }: PageBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors',
        active ? 'bg-blue-600 text-white font-medium' : '',
        disabled ? 'text-gray-300 cursor-not-allowed' : (!active ? 'text-gray-600 hover:bg-gray-100' : ''),
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

/* ============================================================
 * SVG 图标
 * ============================================================ */
function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
