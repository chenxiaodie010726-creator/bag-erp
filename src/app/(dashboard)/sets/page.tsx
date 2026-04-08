/* ============================================================
 * 套装产品管理页面
 * URL: /sets
 * ============================================================ */

'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import SetTable from './_components/SetTable';
import AddSetModal from './_components/AddSetModal';
import type { AddSetPayload } from './_components/AddSetModal';
import EditSetModal from './_components/EditSetModal';
import type { EditSetPatch } from './_components/EditSetModal';
import { MOCK_SETS, SET_STATUS_OPTIONS, COLOR_MAP, CURRENCY_SYMBOL } from './_components/mockData';
import type { SetItem, SetSkuItem } from './_components/mockData';

/* ── 分页组件（复用 products 的样式逻辑） ── */
interface PaginationProps {
  total: number; page: number; pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  function getPages(): (number | '...')[] {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); return pages; }
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }
  const btnBase = 'w-8 h-8 flex items-center justify-center text-sm rounded-md transition-colors';
  return (
    <div className="flex items-center justify-between pt-4 pb-2 border-t border-gray-100">
      <span className="text-sm text-gray-500">共 <b className="text-gray-700">{total}</b> 条</span>
      <div className="flex items-center gap-1">
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 px-2 text-sm border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 mr-2">
          {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}条/页</option>)}
        </select>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className={`${btnBase} ${page <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}>‹</button>
        {getPages().map((p, i) => p === '...'
          ? <span key={`d${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">···</span>
          : <button key={p} onClick={() => onPageChange(p as number)}
              className={`${btnBase} ${p === page ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className={`${btnBase} ${page >= totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}>›</button>
        <div className="flex items-center gap-1 ml-2 text-sm text-gray-500">
          <span>前往</span>
          <input type="number" min={1} max={totalPages}
            className="w-12 h-8 px-1.5 text-center text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = Number((e.target as HTMLInputElement).value);
                if (v >= 1 && v <= totalPages) onPageChange(v);
              }
            }} />
          <span>页</span>
        </div>
      </div>
    </div>
  );
}

/* ── localStorage 持久化 ── */
const STORAGE_KEY = 'cf_erp_sets';
function saveToStorage(data: SetItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota exceeded */ }
}

/* ════════════════════════════════════════════════════════════
 * 主页面
 * ════════════════════════════════════════════════════════════ */
export default function SetsPage() {

  /* ── 数据源 ── */
  const [sets, setSetsRaw] = useState<SetItem[]>(MOCK_SETS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SetItem[];
        if (Array.isArray(parsed) && parsed.length > 0) setSetsRaw(parsed);
      }
    } catch { /* 降级为 mock 数据 */ }
  }, []);

  function setSets(updater: SetItem[] | ((prev: SetItem[]) => SetItem[])) {
    setSetsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveToStorage(next);
      return next;
    });
  }

  const isStoredData = typeof window !== 'undefined' && !!localStorage.getItem(STORAGE_KEY);

  function handleClearStorage() {
    if (!confirm('确认清除所有已保存的修改，恢复演示数据？')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setSetsRaw(MOCK_SETS);
    setPage(1);
    setSelectedIds(new Set());
  }

  /* ── 搜索 & 筛选 ── */
  const [searchText, setSearchText] = useState('');
  const [batchSearchText, setBatchSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('全部状态');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* ── 排序 ── */
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(field: string) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  /* ── 分页 ── */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ── 选中 ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* ── 视图模式 ── */
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  /* ── 弹窗 ── */
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalItem, setEditModalItem] = useState<SetItem | null>(null);

  /* ── 批量操作面板 ── */
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [batchBulkPrice, setBatchBulkPrice] = useState('');
  const [batchDropshipPrice, setBatchDropshipPrice] = useState('');
  const batchPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!batchPanelOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (batchPanelRef.current && !batchPanelRef.current.contains(e.target as Node)) {
        setBatchPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [batchPanelOpen]);

  /* ── 搜索词（用于高亮） ── */
  const [highlightTerms, setHighlightTerms] = useState<string[]>([]);

  /* ── 过滤 + 排序 ── */
  const filteredData = useMemo(() => {
    /* 合并单搜索框和批量搜索框的词 */
    const singleTerms = searchText.trim()
      ? searchText.trim().split(/\s+/).filter(Boolean)
      : [];
    const batchTerms = batchSearchText.trim()
      ? batchSearchText.trim().split(/[,，\n]/).map((t) => t.trim()).filter(Boolean)
      : [];
    const allTerms = [...new Set([...singleTerms, ...batchTerms])];

    let result = sets.filter((item) => {
      /* 状态筛选 */
      if (statusFilter === '启用' && item.status !== 'active') return false;
      if (statusFilter === '停用' && item.status !== 'discontinued') return false;

      /* 日期范围 */
      if (dateFrom && item.createdAt < dateFrom.replace(/-/g, '/')) return false;
      if (dateTo && item.createdAt > dateTo.replace(/-/g, '/')) return false;

      /* 文本搜索：款号、名称、包含的纸格款号 */
      if (allTerms.length > 0) {
        return allTerms.every((term) => {
          const t = term.toLowerCase();
          return (
            item.sku.toLowerCase().includes(t) ||
            item.name.toLowerCase().includes(t) ||
            item.components.some((c) => c.toLowerCase().includes(t))
          );
        });
      }
      return true;
    });

    /* 排序 */
    result = [...result].sort((a, b) => {
      let av: string | number = (a as unknown as Record<string, string | number>)[sortField] ?? '';
      let bv: string | number = (b as unknown as Record<string, string | number>)[sortField] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [sets, searchText, batchSearchText, statusFilter, dateFrom, dateTo, sortField, sortDir]);

  /* ── 分页数据 ── */
  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  /* ── 操作函数 ── */
  function handleSearch() {
    setPage(1);
    const singleTerms = searchText.trim() ? searchText.trim().split(/\s+/).filter(Boolean) : [];
    const batchTerms = batchSearchText.trim()
      ? batchSearchText.trim().split(/[,，\n]/).map((t) => t.trim()).filter(Boolean)
      : [];
    setHighlightTerms([...new Set([...singleTerms, ...batchTerms])]);
  }

  function handleReset() {
    setSearchText('');
    setBatchSearchText('');
    setStatusFilter('全部状态');
    setDateFrom('');
    setDateTo('');
    setHighlightTerms([]);
    setPage(1);
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(selectAll: boolean) {
    if (selectAll) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pagedData.forEach((s) => next.add(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pagedData.forEach((s) => next.delete(s.id));
        return next;
      });
    }
  }

  function handleAddConfirm(payload: AddSetPayload) {
    const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const newItem: SetItem = {
      id: `s_${Date.now()}`,
      imageUrl: null,
      createdAt: today,
      skus: payload.colors.map((colorCode, idx): SetSkuItem => ({
        id: `s_${Date.now()}-sku-${idx}`,
        skuCode: `${payload.sku}-${colorCode}`,
        colorCode,
        stock: 0,
        status: 'active',
        updatedAt: today,
      })),
      ...payload,
    };
    setSets((prev) => [newItem, ...prev]);
    setAddModalOpen(false);
  }

  function handleEditConfirm(id: string, patch: EditSetPatch) {
    setSets((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    setEditModalItem(null);
  }

  function handleUpdateSetSkus(setId: string, skus: SetSkuItem[]) {
    setSets((prev) => prev.map((s) => s.id === setId ? { ...s, skus } : s));
  }

  function bulkDelete() {
    if (!confirm(`确认删除选中的 ${selectedIds.size} 个套装？此操作不可撤销。`)) return;
    setSets((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
    setBatchPanelOpen(false);
  }

  function applyBulkEdit() {
    const bp = parseFloat(batchBulkPrice);
    const dp = parseFloat(batchDropshipPrice);
    setSets((prev) =>
      prev.map((s) => {
        if (!selectedIds.has(s.id)) return s;
        return {
          ...s,
          ...(isNaN(bp) ? {} : { bulkPrice: bp }),
          ...(isNaN(dp) ? {} : { dropshipPrice: dp }),
        };
      })
    );
    setBatchBulkPrice('');
    setBatchDropshipPrice('');
    setBatchPanelOpen(false);
  }

  /* ── 导出 CSV ── */
  function handleExport() {
    const header = ['SKU', '产品名称', '包含款号', '颜色数', '大货价', '一件代发价', '币种', '包装重量', '包装尺寸', '创建日期', '状态'];
    const rows = filteredData.map((s) => [
      s.sku, s.name,
      `"${s.components.join(' | ')}"`,
      s.colors.length,
      s.bulkPrice, s.dropshipPrice,
      s.currency, s.packWeight, s.packSize,
      s.createdAt,
      s.status === 'active' ? '启用' : '停用',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `套装列表_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  /* ════ 渲染 ════ */
  return (
    <div className="flex flex-col gap-6">

      {/* ===== 页头 ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">套装列表</h1>
          <p className="text-sm text-gray-400 mt-0.5">管理所有套装 SKU 信息及其包含的纸格款号</p>
        </div>
        <div className="flex items-center gap-2">
          {isStoredData && (
            <button
              type="button"
              onClick={handleClearStorage}
              className="px-3 py-1.5 text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors"
            >
              × 清除保存
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span>↓</span> 导出
          </button>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + 新建套装
          </button>
        </div>
      </div>

      {/* ===== 搜索栏 ===== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-start gap-3">
          {/* 单关键词搜索 */}
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="搜索套装 SKU、产品名称或款号"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <p className="text-xs text-gray-400 ml-1">可搜索套装 SKU、产品名称或纸格款号</p>
          </div>

          {/* 批量搜索 */}
          <div className="flex flex-col gap-1 flex-1 min-w-52">
            <textarea
              rows={2}
              placeholder={'批量搜索（款号/SKU，支持逗号或换行）'}
              value={batchSearchText}
              onChange={(e) => setBatchSearchText(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
            />
            <p className="text-xs text-gray-400 ml-1">例如：CITYBAG-3SET, TRAVEL-3SET（每行或逗号分隔）</p>
          </div>

          {/* 状态筛选 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              {SET_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* 创建日期范围 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">创建日期</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <span className="text-gray-300">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-end gap-2 pb-0.5">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              重置
            </button>
            <button
              type="button"
              onClick={handleSearch}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
            >
              搜索
            </button>
          </div>
        </div>
      </div>

      {/* ===== 工具栏 ===== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {/* 视图切换 */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={[
                  'px-3 py-1.5 transition-colors',
                  viewMode === 'list' ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:bg-gray-50',
                ].join(' ')}
              >
                ≡ 列表
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={[
                  'px-3 py-1.5 transition-colors border-l border-gray-200',
                  viewMode === 'card' ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:bg-gray-50',
                ].join(' ')}
              >
                ⊞ 卡片
              </button>
            </div>
            <span className="text-sm text-gray-500">
              共 <b className="text-gray-700">{filteredData.length}</b> 个套装
            </span>

            {/* 批量操作 */}
            <div className="relative" ref={batchPanelRef}>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => selectedIds.size > 0 && setBatchPanelOpen((v) => !v)}
                className={[
                  'px-3 py-1.5 text-sm border rounded-md transition-colors',
                  selectedIds.size === 0
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                    : batchPanelOpen
                      ? 'border-gray-400 bg-gray-100 text-gray-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                批量操作{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''} ▾
              </button>

              {/* 浮动面板 */}
              {batchPanelOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 z-30 w-72 bg-white rounded-xl border border-gray-200 shadow-xl"
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-xs font-semibold text-gray-500 mb-3">
                      批量编辑 · 已选 <span className="text-gray-800">{selectedIds.size}</span> 个套装
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">统一设置大货价（留空跳过）</label>
                        <input
                          type="number" min={0} step={0.01} placeholder="输入新价格"
                          value={batchBulkPrice}
                          onChange={(e) => setBatchBulkPrice(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">统一设置一件代发价（留空跳过）</label>
                        <input
                          type="number" min={0} step={0.01} placeholder="输入新价格"
                          value={batchDropshipPrice}
                          onChange={(e) => setBatchDropshipPrice(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-1">
                    <button
                      type="button"
                      onClick={bulkDelete}
                      className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                    >
                      🗑 删除选中
                    </button>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setBatchPanelOpen(false)}
                        className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={applyBulkEdit}
                        disabled={!batchBulkPrice.trim() && !batchDropshipPrice.trim()}
                        className={[
                          'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                          (batchBulkPrice.trim() || batchDropshipPrice.trim())
                            ? 'bg-gray-900 text-white hover:bg-gray-700'
                            : 'bg-gray-100 text-gray-300 cursor-not-allowed',
                        ].join(' ')}
                      >
                        应用修改
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧工具 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSets(MOCK_SETS)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              title="刷新"
            >
              ↻ 刷新
            </button>
          </div>
        </div>

        {/* ===== 列表视图 ===== */}
        {viewMode === 'list' && (
          <div className="px-4 pb-2">
            <SetTable
              data={pagedData}
              selectedIds={selectedIds}
              onToggleItem={toggleItem}
              onToggleAll={toggleAll}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            onEdit={(item) => setEditModalItem(item)}
            onUpdateSetSkus={handleUpdateSetSkus}
            highlightTerms={highlightTerms}
            />
          </div>
        )}

        {/* ===== 卡片视图 ===== */}
        {viewMode === 'card' && (
          <div className="px-4 pb-4">
            {pagedData.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <div className="text-4xl mb-3">🎁</div>
                <p className="text-sm">没有符合条件的套装</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-4">
                {pagedData.map((item) => {
                  const sym = CURRENCY_SYMBOL[item.currency] ?? item.currency;
                  const LIGHT = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);
                  const isSelected = selectedIds.has(item.id);
                  const terms = highlightTerms.map((t) => t.toLowerCase());
                  const highlighted = terms.length > 0 && terms.some(
                    (t) => item.sku.toLowerCase().includes(t) || item.name.toLowerCase().includes(t)
                  );

                  return (
                    <div
                      key={item.id}
                      onDoubleClick={() => router.push(`/sets/${item.id}`)}
                      className={[
                        'relative flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md',
                        isSelected ? 'border-blue-300 ring-2 ring-blue-100' : highlighted ? 'border-amber-300 ring-2 ring-amber-50' : 'border-gray-100',
                      ].join(' ')}
                    >
                      {/* 勾选 */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 bg-white"
                        />
                      </div>

                      {/* 图片区 — 正方形，作为视觉主体 */}
                      <div className="w-full aspect-square bg-gray-50 flex items-center justify-center text-5xl select-none">
                        🎁
                      </div>

                      {/* 状态角标 */}
                      <div className="absolute top-2.5 right-2.5">
                        {item.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-green-600 bg-green-50 rounded-full border border-green-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 启用
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-50 rounded-full border border-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> 停用
                          </span>
                        )}
                      </div>

                      {/* 信息区 */}
                      <div className="flex flex-col gap-1.5 px-2.5 py-2 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-gray-900 text-sm truncate">{item.sku}</span>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(item.sku)}
                            className="text-xs text-blue-400 hover:text-blue-600 shrink-0 transition-colors"
                          >
                            复制
                          </button>
                        </div>

                        <p className="text-xs text-gray-500 truncate leading-tight">{item.name}</p>

                        <div className="flex items-center gap-1 flex-wrap">
                          {item.colors.slice(0, 6).map((code) => {
                            const hex = COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
                            const isLight = LIGHT.has(code);
                            return (
                              <span
                                key={code}
                                title={code}
                                className="inline-block w-4 h-4 rounded shrink-0"
                                style={{ backgroundColor: hex, border: isLight ? '1px solid #d1d5db' : 'none' }}
                              />
                            );
                          })}
                          {item.colors.length > 6 && (
                            <span className="text-xs text-gray-400">+{item.colors.length - 6}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 pt-1.5 border-t border-gray-50 mt-auto">
                          <span>大货 <b className="text-gray-800 font-mono">{sym}{item.bulkPrice.toFixed(2)}</b></span>
                          <span>代发 <b className="text-gray-800 font-mono">{sym}{item.dropshipPrice.toFixed(2)}</b></span>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="px-2.5 pb-2.5">
                        <button
                          type="button"
                          onClick={() => setEditModalItem(item)}
                          className="w-full py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          ✏️ 编辑信息
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== 分页 ===== */}
        <div className="px-4">
          <Pagination
            total={filteredData.length}
            page={page}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </div>
      </div>

      {/* ===== 弹窗 ===== */}
      <AddSetModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onConfirm={handleAddConfirm}
      />
      <EditSetModal
        open={!!editModalItem}
        item={editModalItem}
        onClose={() => setEditModalItem(null)}
        onConfirm={handleEditConfirm}
      />
    </div>
  );
}
