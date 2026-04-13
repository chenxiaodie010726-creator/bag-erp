'use client';

/* ============================================================
 * 客户订单 — 订单总览页面
 * 说明: 展示所有客户 PO，支持时间轴筛选、搜索、导入/导出
 * 文件位置: src/app/(dashboard)/orders/page.tsx
 * URL: /orders
 * ============================================================ */

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import ImportOrderDetailModal from './_components/ImportOrderDetailModal';
import { MOCK_ORDERS } from './_components/mockData';
import type { OrderItem, OrderStatus } from './_components/mockData';
import { getOrderDetail } from '@/app/(dashboard)/orders/[id]/_components/mockData';
import type { OrderDetailData, OrderDetailItem } from '@/app/(dashboard)/orders/[id]/_components/mockData';
import { syncOrderToInventory, type UnregisteredSkuEntry } from '@/lib/orderInventorySync';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

const STORAGE_KEY = 'cf_erp_orders_v1';

/** 若本地已有订单明细，用明细行数作为 SKU 数量，与详情页一致 */
function readDetailSkuCount(orderId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDER_DETAIL_PREFIX + orderId);
    if (!raw) return null;
    const data = JSON.parse(raw) as { items?: { length: number } };
    const n = data?.items?.length;
    return typeof n === 'number' && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * 列表「SKU数量」与订单详情页对齐：
 * - 若已保存订单明细（含 Excel 导入明细），用明细行数；
 * - 若为 Excel/表单新建的订单且尚无明细，用列表里用户填写的 poQty；
 * - 其余（模拟种子订单等）用与详情页相同的 getOrderDetail 行数，不用 mock 里随机 poQty。
 */
function getDisplaySkuCount(o: OrderItem): number {
  const fromStorage = readDetailSkuCount(o.id);
  if (fromStorage != null) return fromStorage;
  if (o.id.startsWith('imported_') || o.id.startsWith('created_')) {
    return o.poQty;
  }
  return getOrderDetail(o.id, o.batches, o.amount, o.poQty).items.length;
}
const PAGE_SIZE_OPTIONS = [10, 20, 50];

function saveToStorage(data: OrderItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota — silent */ }
}

/* ============================================================
 * 主页面
 * ============================================================ */
export default function OrdersPage() {
  const router = useRouter();
  const { showPrice } = useAuth();

  /* ===== 数据源 ===== */
  const [orders, setOrdersRaw] = useState<OrderItem[]>(MOCK_ORDERS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed = JSON.parse(stored) as OrderItem[];
        /* 历史数据：PO#031826 曾误存为 poQty 32，与明细 20 条 SKU 不一致 */
        let migrated = false;
        parsed = parsed.map((o) => {
          if (o.id === 'order_known_0' && o.poNumber === 'PO#031826' && o.poQty === 32) {
            migrated = true;
            return { ...o, poQty: 20 };
          }
          return o;
        });
        if (migrated) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        if (Array.isArray(parsed) && parsed.length > 0) setOrdersRaw(parsed);
      }
    } catch { /* fallback to mock */ }
  }, []);

  function setOrders(updater: OrderItem[] | ((prev: OrderItem[]) => OrderItem[])) {
    setOrdersRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveToStorage(next);
      return next;
    });
  }

  /* ===== 弹窗 ===== */
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [unregAlert, setUnregAlert] = useState<UnregisteredSkuEntry[] | null>(null);

  /* ===== 时间轴筛选（默认北京时间当前年份，全年范围） ===== */
  const [filterYear, setFilterYear]         = useState(() => {
    const now = new Date(Date.now() + 8 * 3600_000);
    return now.getUTCFullYear();
  });
  const [filterStartMonth, setFilterStartMonth] = useState(1);
  const [filterEndMonth, setFilterEndMonth]     = useState(12);

  /* ===== 搜索 & 筛选 ===== */
  const [searchText, setSearchText]   = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('全部');
  const [filterBatches, setFilterBatches] = useState<string>('全部');
  const [dateStart, setDateStart]     = useState('');
  const [dateEnd, setDateEnd]         = useState('');

  /* ===== 排序 ===== */
  const [sortField, setSortField] = useState<keyof OrderItem>('orderDate');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  /* ===== 分页 ===== */
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* 从详情页返回或保存明细后，刷新列表中的 SKU 数量 */
  const [detailSkuSync, setDetailSkuSync] = useState(0);
  useEffect(() => {
    function bump() { setDetailSkuSync((x) => x + 1); }
    window.addEventListener('focus', bump);
    const onVis = () => { if (document.visibilityState === 'visible') bump(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const ordersWithDetailSku = useMemo(() => {
    return orders.map((o) => ({
      ...o,
      poQty: getDisplaySkuCount(o),
    }));
  }, [orders, detailSkuSync]);

  /* ===== 筛选逻辑 ===== */
  const filteredOrders = useMemo(() => {
    const yearStart = `${filterYear}-${String(filterStartMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(filterYear, filterEndMonth, 0).getDate();
    const yearEnd = `${filterYear}-${String(filterEndMonth).padStart(2, '0')}-${lastDay}`;

    return ordersWithDetailSku
      .filter((o) => {
        /* 时间轴年月范围 */
        if (o.orderDate < yearStart || o.orderDate > yearEnd) return false;
        /* 搜索框 */
        if (searchText) {
          const q = searchText.toLowerCase();
          if (!o.poNumber.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) return false;
        }
        /* 订单状态 */
        if (filterStatus !== '全部' && o.status !== filterStatus) return false;
        /* 分批 */
        if (filterBatches !== '全部' && o.batches !== parseInt(filterBatches, 10)) return false;
        /* 自定义日期范围 */
        if (dateStart && o.orderDate < dateStart) return false;
        if (dateEnd   && o.orderDate > dateEnd)   return false;
        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [ordersWithDetailSku, filterYear, filterStartMonth, filterEndMonth, searchText, filterStatus, filterBatches, dateStart, dateEnd, sortField, sortDir]);

  /* 筛选后重置到第一页 */
  useEffect(() => { setPage(1); }, [filteredOrders]);

  /* ===== 统计 ===== */
  const stats = useMemo(() => {
    const totalOrders  = orders.length;
    const totalAmount  = filteredOrders.reduce((s, o) => s + o.amount, 0);
    const totalSkuQty  = filteredOrders.reduce((s, o) => s + o.poQty, 0);
    const incomplete   = filteredOrders.filter((o) => o.status === '待确认' || o.status === '部分发货').length;
    const complete     = filteredOrders.filter((o) => o.status === '已发货' || o.status === '已确认').length;
    return { totalOrders, totalAmount, totalSkuQty, incomplete, complete };
  }, [orders, filteredOrders]);

  /* ===== 分页切片 ===== */
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pageItems  = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  /* ===== 排序切换 ===== */
  function handleSort(field: keyof OrderItem) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  /* ===== 导出 ===== */
  function handleExport() {
    const rows = filteredOrders.map((o) => {
      const row: Record<string, string | number> = {
        'PO号': o.poNumber,
        'SKU数量': o.poQty,
        '分批': `${o.batches}批`,
        '订单状态': o.status,
        '订单日期': o.orderDate,
        '客户名称': o.customerName,
      };
      if (showPrice) {
        row['订单金额(USD)'] = o.amount;
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = showPrice
      ? [{ wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 16 }]
      : [{ wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单总览');
    XLSX.writeFile(wb, `订单总览_${filterYear}年${filterStartMonth}-${filterEndMonth}月.xlsx`);
  }

  /* ===== 导入订单明细：按 PO# 列写入，可一次更新多个订单 ===== */
  function handleOrderDetailImported(payloads: { order: OrderItem; detail: OrderDetailData }[]) {
    const mergedById = new Map<string, OrderItem>();
    const allUnreg: UnregisteredSkuEntry[] = [];

    for (const { order, detail } of payloads) {
      const amount = detail.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const batches = Math.max(1, detail.shipmentDates.length);
      const merged: OrderItem = { ...order, poQty: detail.items.length, amount, batches };
      mergedById.set(order.id, merged);
      const { unregisteredSkus } = syncOrderToInventory(merged, detail);
      allUnreg.push(...unregisteredSkus);
    }

    setOrders((prev) => {
      const existingIds = new Set(prev.map((o) => o.id));
      const updated = prev.map((o) => mergedById.get(o.id) ?? o);
      const inserted = [...mergedById.values()].filter((o) => !existingIds.has(o.id));
      return inserted.length > 0 ? [...inserted, ...updated] : updated;
    });
    if (allUnreg.length > 0) setUnregAlert(allUnreg);
    setPage(1);
  }

  /* ===== 重置筛选 ===== */
  function handleReset() {
    setSearchText('');
    setFilterStatus('全部');
    setFilterBatches('全部');
    setDateStart('');
    setDateEnd('');
    setPage(1);
  }

  /* ===== 新建订单（简单表单弹窗） ===== */
  const isUsingImportedData = orders !== MOCK_ORDERS;

  /* ===== 月份范围改变 ===== */
  function handleMonthRangeChange(start: number, end: number) {
    setFilterStartMonth(start);
    setFilterEndMonth(end);
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">

      {/* ========================================
          页面标题栏
          ======================================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">订单总览</h1>
          <p className="text-sm text-gray-400 mt-0.5">查看和管理所有客户订单</p>
        </div>
        <div className="flex items-center gap-2">
          {isUsingImportedData && (
            <button
              onClick={() => {
                if (!confirm('确认恢复演示数据？')) return;
                try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
                setOrdersRaw(MOCK_ORDERS);
                setPage(1);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              ✕ 清除导入
            </button>
          )}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <UploadIcon /> 导入订单明细
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <DownloadIcon /> 导出
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + 新建订单
          </button>
        </div>
      </div>

      {/* ========================================
          统计卡片
          ======================================== */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${showPrice ? 5 : 4}, minmax(0, 1fr))` }}>
        <StatCard
          icon={<DocIcon />}
          iconBg="bg-blue-50"
          label="总订单"
          value={stats.totalOrders.toString()}
          valueClass="text-gray-800"
        />
        {showPrice && (
          <StatCard
            icon={<DollarIcon />}
            iconBg="bg-green-50"
            label="订单金额"
            value={`$${stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            valueClass="text-gray-800 text-base"
          />
        )}
        <StatCard
          icon={<ListIcon />}
          iconBg="bg-amber-50"
          label="总SKU数量"
          value={stats.totalSkuQty.toLocaleString()}
          valueClass="text-gray-800"
        />
        <StatCard
          icon={<ClockIcon />}
          iconBg="bg-orange-50"
          label="未完成订单"
          value={stats.incomplete.toString()}
          valueClass="text-orange-500"
        />
        <StatCard
          icon={<CheckIcon />}
          iconBg="bg-emerald-50"
          label="已完成订单"
          value={stats.complete.toString()}
          valueClass="text-emerald-600"
        />
      </div>

      {/* ========================================
          时间轴月份筛选
          ======================================== */}
      <MonthRangeSlider
        year={filterYear}
        startMonth={filterStartMonth}
        endMonth={filterEndMonth}
        onChangeYear={setFilterYear}
        onChangeRange={handleMonthRangeChange}
        onClear={() => { setFilterStartMonth(1); setFilterEndMonth(12); }}
      />

      {/* ========================================
          搜索 & 筛选栏
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="搜索PO号或客户名称"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* 订单状态 */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500 whitespace-nowrap">订单状态</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            <option value="全部">全部</option>
            <option value="已确认">已确认</option>
            <option value="待确认">待确认</option>
            <option value="部分发货">部分发货</option>
            <option value="已发货">已发货</option>
            <option value="已取消">已取消</option>
          </select>
        </div>

        {/* 分批 */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500">分批</span>
          <select
            value={filterBatches}
            onChange={(e) => setFilterBatches(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            <option value="全部">全部</option>
            <option value="1">1批</option>
            <option value="2">2批</option>
            <option value="3">3批</option>
            <option value="4">4批</option>
          </select>
        </div>

        {/* 订单日期范围 */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-400 text-xs">🗓</span>
          <span className="text-gray-500">订单日期</span>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <FilterIcon /> 筛选
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <RefreshIcon /> 刷新
          </button>
        </div>
      </div>

      {/* ========================================
          订单表格
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <SortTh field="poNumber"    label="PO号"         sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              {showPrice && (
                <SortTh field="amount"      label="订单金额 (USD)" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              )}
              <SortTh field="poQty"       label="SKU数量"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortTh field="batches"     label="分批"          sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortTh field="status"      label="订单状态"      sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortTh field="orderDate"   label="订单日期"      sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortTh field="customerName" label="客户名称"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={showPrice ? 8 : 7} className="text-center py-16 text-gray-400">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-sm">没有符合条件的订单</p>
                  <button onClick={handleReset} className="mt-2 text-sm text-blue-500 hover:underline">
                    清除筛选条件
                  </button>
                </td>
              </tr>
            ) : (
              pageItems.map((order) => (
                <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  {/* PO号 — 点击进入详情页 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium text-blue-600 hover:underline hover:text-blue-800 transition-colors"
                    >
                      {order.poNumber}
                    </Link>
                  </td>
                  {/* 订单金额 */}
                  {showPrice && (
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      ${order.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  {/* SKU数量 */}
                  <td className="px-4 py-3 text-gray-700">{order.poQty}</td>
                  {/* 分批 */}
                  <td className="px-4 py-3 text-gray-700">{order.batches} 批</td>
                  {/* 订单状态 */}
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  {/* 订单日期 */}
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{order.orderDate}</td>
                  {/* 客户名称 */}
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{order.customerName}</td>
                  {/* 操作 */}
                  <td className="px-4 py-3">
                    <button className="text-gray-400 hover:text-gray-600 transition-colors" title="查看详情">
                      <EyeIcon />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================
          分页
          ======================================== */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span>共 {filteredOrders.length} 条</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}条/页</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
          {getPageNumbers(page, totalPages).map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis_${i}`} className="px-2 py-1 text-gray-400">…</span>
            ) : (
              <PageBtn key={p} active={page === p} onClick={() => setPage(p as number)}>
                {p}
              </PageBtn>
            )
          )}
          <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          <span className="ml-2 text-gray-500">前往</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 1 && v <= totalPages) setPage(v);
            }}
            className="w-12 text-center border border-gray-200 rounded-md px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-gray-500">页</span>
        </div>
      </div>

      {/* ===== 导入订单明细（写入所选 PO 的明细与本地缓存） ===== */}
      <ImportOrderDetailModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        orders={orders}
        onImported={handleOrderDetailImported}
      />

      {unregAlert && unregAlert.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setUnregAlert(null); }}
        >
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <h2 className="text-base font-semibold text-gray-800">发现未录入的 SKU</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    以下 {unregAlert.length} 个 SKU 在产品列表/套装列表中不存在
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setUnregAlert(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="px-6 py-4 max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 font-medium text-gray-500">SKU</th>
                    <th className="pb-2 font-medium text-gray-500">款式</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {unregAlert.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 font-mono text-xs text-gray-700">{item.sku}</td>
                      <td className="py-2 text-gray-600">{item.styleName}</td>
                      <td className="py-2 text-right text-gray-700">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700">
                这些 SKU 已自动添加到「未录入」页面，同时订单已同步到「订单库存」（入库数量为 0）。
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setUnregAlert(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                我知道了
              </button>
              <button
                type="button"
                onClick={() => { setUnregAlert(null); router.push('/unregistered'); }}
                className="px-5 py-2 text-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                前往未录入页面
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 新建订单弹窗 ===== */}
      {createOpen && (
        <CreateOrderModal
          onClose={() => setCreateOpen(false)}
          onConfirm={({ order: newOrder, detail }) => {
            try {
              localStorage.setItem(STORAGE_KEYS.ORDER_DETAIL_PREFIX + newOrder.id, JSON.stringify(detail));
            } catch { /* quota */ }
            const { unregisteredSkus } = syncOrderToInventory(newOrder, detail);
            if (unregisteredSkus.length > 0) setUnregAlert(unregisteredSkus);
            setOrders((prev) => [newOrder, ...prev]);
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}


/* ============================================================
 * MonthRangeSlider — 年度月份范围选择器
 * ============================================================ */
interface MonthRangeSliderProps {
  year: number;
  startMonth: number;
  endMonth: number;
  onChangeYear: (y: number) => void;
  onChangeRange: (start: number, end: number) => void;
  onClear: () => void;
}

function MonthRangeSlider({ year, startMonth, endMonth, onChangeYear, onChangeRange, onClear }: MonthRangeSliderProps) {
  const trackRef  = useRef<HTMLDivElement>(null);
  const dragging  = useRef<'start' | 'end' | null>(null);
  const stateRef  = useRef({ startMonth, endMonth });
  stateRef.current = { startMonth, endMonth };

  const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  function monthToPct(m: number) { return (m - 1) / 11 * 100; }
  function clientXToMonth(x: number) {
    if (!trackRef.current) return 1;
    const { left, width } = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x - left) / width));
    return Math.max(1, Math.min(12, Math.round(pct * 11) + 1));
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const m = clientXToMonth(e.clientX);
      const { startMonth: s, endMonth: e2 } = stateRef.current;
      if (dragging.current === 'start') onChangeRange(Math.min(m, e2), e2);
      else onChangeRange(s, Math.max(m, s));
    }
    function onUp() { dragging.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChangeRange]);

  const startPct = monthToPct(startMonth);
  const endPct   = monthToPct(endMonth);
  const monthCount = endMonth - startMonth + 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-6 py-4">

      {/* 顶行：年份选择 + 视图切换 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            className="text-sm font-semibold border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            {[2022, 2023, 2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <button
            onClick={() => onChangeYear(year - 1)}
            className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors text-base"
          >‹</button>
          <button
            onClick={() => onChangeYear(year + 1)}
            className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors text-base"
          >›</button>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors">
            🗓 自定义
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors">
            按月查看 ▾
          </button>
        </div>
      </div>

      {/* 月份滑动条 */}
      <div className="px-2">
        <div
          ref={trackRef}
          className="relative h-1.5 bg-gray-200 rounded-full cursor-pointer select-none"
          onClick={(e) => {
            const m = clientXToMonth(e.clientX);
            if (Math.abs(m - startMonth) <= Math.abs(m - endMonth)) {
              onChangeRange(Math.min(m, endMonth), endMonth);
            } else {
              onChangeRange(startMonth, Math.max(m, startMonth));
            }
          }}
        >
          {/* 已选区间填充 */}
          <div
            className="absolute h-full bg-blue-500 rounded-full pointer-events-none"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          {/* 起始手柄 */}
          <div
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-sm cursor-grab active:cursor-grabbing z-10"
            style={{ left: `${startPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
            onMouseDown={(e) => { e.stopPropagation(); dragging.current = 'start'; }}
          />
          {/* 结束手柄 */}
          <div
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-sm cursor-grab active:cursor-grabbing z-10"
            style={{ left: `${endPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
            onMouseDown={(e) => { e.stopPropagation(); dragging.current = 'end'; }}
          />
        </div>

        {/* 月份标签 */}
        <div className="flex justify-between mt-3">
          {MONTHS.map((label, i) => {
            const m = i + 1;
            const active = m >= startMonth && m <= endMonth;
            return (
              <button
                key={m}
                onClick={() => {
                  if      (m <= startMonth) onChangeRange(m, endMonth);
                  else if (m >= endMonth)   onChangeRange(startMonth, m);
                  else                      onChangeRange(m, m);
                }}
                className={[
                  'text-xs w-8 text-center transition-colors',
                  active ? 'text-blue-600 font-semibold' : 'text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 已选信息 */}
      <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
        <span>🗓</span>
        <span>
          已选择：{year}年{startMonth}月 ~ {year}年{endMonth}月（共 {monthCount} 个月）
        </span>
        <button onClick={onClear} className="text-blue-500 hover:text-blue-700 ml-1">清空</button>
      </div>
    </div>
  );
}


/* ============================================================
 * 新建订单弹窗（含多行 SKU 明细，与订单详情结构一致）
 * ============================================================ */
interface CreateOrderModalProps {
  onClose: () => void;
  onConfirm: (payload: { order: OrderItem; detail: OrderDetailData }) => void;
}

interface DraftLine {
  id: string;
  sku: string;
  colorName: string;
  styleName: string;
  unitPrice: string;
  quantity: string;
}

function newDraftLine(): DraftLine {
  return {
    id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    sku: '',
    colorName: '',
    styleName: '',
    unitPrice: '',
    quantity: '',
  };
}

function CreateOrderModal({ onClose, onConfirm }: CreateOrderModalProps) {
  const [form, setForm] = useState({
    poNumber: '',
    batches: '1',
    status: '待确认' as OrderStatus,
    orderDate: new Date().toISOString().slice(0, 10),
    customerName: '',
  });
  const [lines, setLines] = useState<DraftLine[]>(() => [newDraftLine()]);

  const computedAmount = useMemo(() => {
    let s = 0;
    for (const l of lines) {
      const p = parseFloat(l.unitPrice) || 0;
      const q = parseInt(l.quantity, 10) || 0;
      s += p * q;
    }
    return s;
  }, [lines]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.poNumber.trim() || !form.customerName.trim()) {
      alert('请填写 PO号 和 客户名称');
      return;
    }
    const batchNum = Math.max(1, Math.min(12, parseInt(form.batches, 10) || 1));
    const shipmentDates = Array.from({ length: batchNum }, (_, i) => `批次${i + 1}`);

    const validLines = lines.filter((l) => {
      const sku = l.sku.trim();
      const q = parseInt(l.quantity, 10) || 0;
      return sku.length > 0 && q > 0;
    });
    if (validLines.length === 0) {
      alert('请至少添加一行有效明细：填写 SKU 与数量（大于 0）');
      return;
    }

    const orderId = `created_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const items: OrderDetailItem[] = validLines.map((l, idx) => {
      const qty = parseInt(l.quantity, 10) || 0;
      const unitPrice = parseFloat(l.unitPrice) || 0;
      return {
        id: `${orderId}_line_${idx}`,
        sku: l.sku.trim(),
        colorName: l.colorName.trim(),
        styleName: l.styleName.trim(),
        unitPrice,
        quantity: qty,
        shipments: shipmentDates.map((date, bi) => ({ date, qty: bi === 0 ? qty : null })),
        remarks: '',
      };
    });

    const detail: OrderDetailData = { shipmentDates, items };
    const amount = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    onConfirm({
      order: {
        id: orderId,
        poNumber: form.poNumber.trim(),
        amount,
        poQty: items.length,
        batches: batchNum,
        status: form.status,
        orderDate: form.orderDate,
        customerName: form.customerName.trim(),
      },
      detail,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">新建订单</h2>
            <p className="text-xs text-gray-400 mt-0.5">填写订单头信息后，在下方添加多行 SKU（与订单详情页一致）</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FormField label="PO号 *">
              <input
                required
                type="text"
                placeholder="如 PO#031999"
                value={form.poNumber}
                onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                className={FORM_INPUT}
              />
            </FormField>
            <FormField label="客户名称 *">
              <input
                required
                type="text"
                placeholder="客户公司名"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                className={FORM_INPUT}
              />
            </FormField>
            <FormField label="分批">
              <select
                value={form.batches}
                onChange={(e) => setForm({ ...form, batches: e.target.value })}
                className={FORM_INPUT}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}批</option>)}
              </select>
            </FormField>
            <FormField label="订单状态">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus })}
                className={FORM_INPUT}
              >
                <option value="待确认">待确认</option>
                <option value="已确认">已确认</option>
                <option value="部分发货">部分发货</option>
                <option value="已发货">已发货</option>
                <option value="已取消">已取消</option>
              </select>
            </FormField>
            <FormField label="订单日期">
              <input
                type="date"
                value={form.orderDate}
                onChange={(e) => setForm({ ...form, orderDate: e.target.value })}
                className={FORM_INPUT}
              />
            </FormField>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-700">产品明细</span>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, newDraftLine()])}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + 添加一行
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-white border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-2 py-2 font-medium w-[28%]">SKU *</th>
                    <th className="px-2 py-2 font-medium w-[18%]">颜色</th>
                    <th className="px-2 py-2 font-medium w-[22%]">Style Name</th>
                    <th className="px-2 py-2 font-medium w-[12%]">单价(USD)</th>
                    <th className="px-2 py-2 font-medium w-[10%]">数量 *</th>
                    <th className="px-2 py-2 font-medium w-[10%] text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 align-top">
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          placeholder="SKU"
                          value={row.sku}
                          onChange={(e) => setLines((prev) => prev.map((r) => (r.id === row.id ? { ...r, sku: e.target.value } : r)))}
                          className={FORM_INPUT}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          placeholder="颜色"
                          value={row.colorName}
                          onChange={(e) => setLines((prev) => prev.map((r) => (r.id === row.id ? { ...r, colorName: e.target.value } : r)))}
                          className={FORM_INPUT}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          placeholder="可选"
                          value={row.styleName}
                          onChange={(e) => setLines((prev) => prev.map((r) => (r.id === row.id ? { ...r, styleName: e.target.value } : r)))}
                          className={FORM_INPUT}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={row.unitPrice}
                          onChange={(e) => setLines((prev) => prev.map((r) => (r.id === row.id ? { ...r, unitPrice: e.target.value } : r)))}
                          className={FORM_INPUT}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="0"
                          value={row.quantity}
                          onChange={(e) => setLines((prev) => prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r)))}
                          className={FORM_INPUT}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={lines.length <= 1}
                          onClick={() => setLines((prev) => prev.filter((r) => r.id !== row.id))}
                          className={[
                            'text-xs',
                            lines.length <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-red-500 hover:text-red-700',
                          ].join(' ')}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <span>
              明细行数：<strong className="text-gray-900">{lines.filter((l) => l.sku.trim() && (parseInt(l.quantity, 10) || 0) > 0).length}</strong>
            </span>
            <span className="text-gray-300">|</span>
            <span>
              订单金额合计 (USD)：<strong className="text-gray-900">{computedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-xs text-gray-400">（由各行 单价×数量 自动汇总）</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              创建订单
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ============================================================
 * 内部小组件
 * ============================================================ */

/* 统计卡片 */
interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueClass?: string;
}
function StatCard({ icon, iconBg, label, value, valueClass = 'text-gray-800' }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className={`font-bold text-lg leading-tight truncate ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

/* 可排序表头单元格 */
interface SortThProps {
  field: keyof OrderItem;
  label: string;
  sortField: keyof OrderItem;
  sortDir: 'asc' | 'desc';
  onSort: (f: keyof OrderItem) => void;
}
function SortTh({ field, label, sortField, sortDir, onSort }: SortThProps) {
  const active = sortField === field;
  return (
    <th
      className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer whitespace-nowrap hover:bg-gray-100 transition-colors select-none"
      onClick={() => onSort(field)}
    >
      {label}
      <span className={`ml-1 text-xs ${active ? 'text-gray-800' : 'text-gray-300'}`}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  );
}

/* 状态徽章 */
const STATUS_STYLES: Record<OrderStatus, string> = {
  '已确认': 'bg-green-100  text-green-700',
  '待确认': 'bg-amber-100  text-amber-600',
  '部分发货': 'bg-blue-100  text-blue-700',
  '已发货': 'bg-teal-100   text-teal-700',
  '已取消': 'bg-gray-100   text-gray-500',
};
function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

/* 分页按钮 */
interface PageBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}
function PageBtn({ children, onClick, active, disabled }: PageBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors',
        active    ? 'bg-blue-600 text-white font-medium'           : '',
        disabled  ? 'text-gray-300 cursor-not-allowed'             : 'text-gray-600 hover:bg-gray-100',
        !active && !disabled ? '' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* 表单字段容器 */
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const FORM_INPUT = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white';

/* 分页数字生成 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}


/* ============================================================
 * SVG 图标组件
 * ============================================================ */
function DocIcon() {
  return (
    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function DollarIcon() {
  return (
    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
function FilterIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
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
function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
