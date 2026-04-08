'use client';

/* ============================================================
 * 订单详情页
 * 说明: 展示单个 PO 的所有 SKU 明细、分批发货数量
 *       支持导入（匹配 Excel 原始格式）/ 导出
 * 文件位置: src/app/(dashboard)/orders/[id]/page.tsx
 * URL: /orders/[id]
 * ============================================================ */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { MOCK_ORDERS } from '../_components/mockData';
import { getOrderDetail } from './_components/mockData';
import type { OrderDetailItem, ShipmentBatch, OrderDetailData } from './_components/mockData';
import type { OrderItem, OrderStatus } from '../_components/mockData';
import { syncOrderToInventory, type UnregisteredSkuEntry } from '@/lib/orderInventorySync';
import { STORAGE_KEYS } from '@/lib/storageKeys';

const DETAIL_STORAGE_PREFIX = STORAGE_KEYS.ORDER_DETAIL_PREFIX;
const ORDERS_STORAGE_KEY = STORAGE_KEYS.ORDERS;

function saveDetail(orderId: string, data: OrderDetailData) {
  try { localStorage.setItem(DETAIL_STORAGE_PREFIX + orderId, JSON.stringify(data)); } catch { /* quota */ }
}
function loadDetail(orderId: string): OrderDetailData | null {
  try {
    const s = localStorage.getItem(DETAIL_STORAGE_PREFIX + orderId);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

/* ============================================================
 * 主页面
 * ============================================================ */
export default function OrderDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const orderId = params.id as string;

  /* ===== 查找父订单（优先 localStorage，回退 MOCK） ===== */
  const order = useMemo(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(ORDERS_STORAGE_KEY) : null;
      if (stored) {
        const list: OrderItem[] = JSON.parse(stored);
        const found = list.find((o) => o.id === orderId);
        if (found) return found;
      }
    } catch { /* ignore */ }
    return MOCK_ORDERS.find((o) => o.id === orderId) ?? null;
  }, [orderId]);

  /* ===== 明细数据 ===== */
  const [detailData, setDetailDataRaw] = useState<OrderDetailData | null>(null);

  /* ===== 未录入 SKU 提示 ===== */
  const [unregAlert, setUnregAlert] = useState<UnregisteredSkuEntry[] | null>(null);

  useEffect(() => {
    if (!order) return;
    const stored = loadDetail(orderId);
    if (stored) {
      setDetailDataRaw(stored);
    } else {
      setDetailDataRaw(getOrderDetail(orderId, order.batches, order.amount, order.poQty));
    }
  }, [orderId, order]);

  function setDetailData(data: OrderDetailData) {
    setDetailDataRaw(data);
    saveDetail(orderId, data);
  }

  /* ===== 弹窗 ===== */
  const [importOpen, setImportOpen]  = useState(false);
  const [copied, setCopied]          = useState(false);

  /* ===== 搜索 & 批次筛选 ===== */
  const [search, setSearch]            = useState('');
  const [filterBatch, setFilterBatch]  = useState<string>('全部'); // "全部" | "0" | "1" | ...（索引）

  /* ===== 分页 ===== */
  const [page, setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ===== 筛选 ===== */
  const filteredItems = useMemo(() => {
    if (!detailData) return [];
    return detailData.items.filter((item) => {
      if (search) {
        const q = search.toLowerCase();
        if (!item.sku.toLowerCase().includes(q) && !item.colorName.toLowerCase().includes(q) && !item.styleName.toLowerCase().includes(q)) return false;
      }
      if (filterBatch !== '全部') {
        const idx = parseInt(filterBatch, 10);
        const s = item.shipments[idx];
        if (!s || s.qty === null) return false;
      }
      return true;
    });
  }, [detailData, search, filterBatch]);

  useEffect(() => { setPage(1); }, [filteredItems]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageItems  = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  /* ===== 统计 ===== */
  const stats = useMemo(() => {
    if (!detailData) return { totalQty: 0, totalAmount: 0, skuCount: 0 };
    const totalQty    = detailData.items.reduce((s, i) => s + i.quantity, 0);
    const totalAmount = detailData.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    return { totalQty, totalAmount, skuCount: detailData.items.length };
  }, [detailData]);

  /* ===== 复制 PO 号 ===== */
  function handleCopy() {
    if (!order) return;
    navigator.clipboard.writeText(order.poNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ===== 导出 Excel (匹配 image 2 格式) ===== */
  function handleExport() {
    if (!detailData || !order) return;
    const dates = detailData.shipmentDates;

    const headers = [
      '图片', 'SKU', 'Color Name', 'Style Name', 'EXW', 'EXW Cost', 'QTY',
      ...dates.map((d) => `Ship date Start ${d}`),
    ];

    const rows = detailData.items.map((item) => [
      '',  // 图片（留空）
      item.sku,
      item.colorName,
      item.styleName,
      item.unitPrice,
      +(item.unitPrice * item.quantity).toFixed(2),
      item.quantity,
      ...dates.map((_, di) => {
        const qty = item.shipments[di]?.qty ?? null;
        return qty === null ? '-' : qty;
      }),
    ]);

    /* Total 汇总行 */
    const totalRow = [
      'Total', '', '', '',
      '', // 不汇总单价
      +(detailData.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)).toFixed(2),
      detailData.items.reduce((s, i) => s + i.quantity, 0),
      ...dates.map((_, di) =>
        detailData.items.reduce((s, i) => s + (i.shipments[di]?.qty ?? 0), 0)
      ),
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, totalRow]);

    /* 列宽 */
    ws['!cols'] = [
      { wch: 8 }, { wch: 34 }, { wch: 16 }, { wch: 26 },
      { wch: 8 }, { wch: 12 }, { wch: 8 },
      ...dates.map(() => ({ wch: 20 })),
    ];

    /* 合并"Total"标签跨前4列 */
    ws['!merges'] = [{ s: { r: rows.length + 1, c: 0 }, e: { r: rows.length + 1, c: 3 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, order.poNumber.replace('#', ''));
    XLSX.writeFile(wb, `${order.poNumber.replace('#', '')}.xlsx`);
  }

  /* ===== 导入确认回调 ===== */
  function handleImportConfirm(data: OrderDetailData) {
    setDetailData(data);
    setPage(1);

    if (order) {
      const { unregisteredSkus } = syncOrderToInventory(order, data);
      if (unregisteredSkus.length > 0) {
        setUnregAlert(unregisteredSkus);
      }
    }
  }

  /* ===== 重置 ===== */
  function handleReset() {
    setSearch('');
    setFilterBatch('全部');
    setPage(1);
  }

  /* ===== 404 ===== */
  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-400">
        <div className="text-5xl mb-4">📭</div>
        <p className="text-lg font-medium text-gray-600">未找到该订单</p>
        <Link href="/orders" className="mt-4 text-blue-500 hover:underline text-sm">← 返回订单列表</Link>
      </div>
    );
  }

  const shipDates = detailData?.shipmentDates ?? [];

  return (
    <div className="flex flex-col gap-4">

      {/* ========================================
          面包屑 + 操作按钮
          ======================================== */}
      <div className="flex items-start justify-between">
        <div>
          {/* 面包屑 */}
          <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
            <button onClick={() => router.back()} className="hover:text-gray-600 flex items-center gap-1">
              <ArrowLeftIcon className="w-3.5 h-3.5" /> 返回
            </button>
            <span>/</span>
            <Link href="/orders" className="hover:text-gray-600">订单总览</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{order.poNumber}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">订单详情</h1>
          <p className="text-sm text-gray-400 mt-0.5">查看和管理订单的详细信息</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <UploadIcon /> 导入
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <DownloadIcon /> 导出
          </button>
        </div>
      </div>

      {/* ========================================
          订单信息栏
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-4 flex items-center gap-8 flex-wrap">

        {/* PO号 */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400">PO号码</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-800">{order.poNumber}</span>
            <button
              onClick={handleCopy}
              title="复制 PO 号"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              {copied ? <CheckSmallIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>

        <Divider />

        {/* 订单金额 */}
        <InfoItem
          label="订单金额"
          value={`$${stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          valueClass="text-xl font-bold text-gray-800"
        />

        <Divider />

        {/* 总数量 */}
        <InfoItem
          label="总数量"
          value={stats.totalQty.toLocaleString()}
          valueClass="text-xl font-bold text-gray-800"
        />

        <Divider />

        {/* SKU数量 */}
        <InfoItem
          label="SKU数量"
          value={stats.skuCount.toString()}
          valueClass="text-xl font-bold text-gray-800"
        />

        <Divider />

        {/* 订单状态 */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">订单状态</span>
          <StatusBadge status={order.status} />
        </div>

        <Divider />

        {/* 客户 */}
        <InfoItem label="客户" value={order.customerName} valueClass="text-base font-medium text-gray-700" />

        <Divider />

        {/* 订单日期 */}
        <InfoItem label="订单日期" value={order.orderDate} valueClass="text-base font-medium text-gray-700" />
      </div>

      {/* ========================================
          筛选栏
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="搜索 SKU 或颜色名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* 分批发货筛选 */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500 whitespace-nowrap">分批发货</span>
          <select
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            <option value="全部">全部</option>
            {shipDates.map((date, i) => (
              <option key={i} value={String(i)}>分批 {i + 1}（{date}）</option>
            ))}
          </select>
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
          明细表格
          ======================================== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-3 text-left font-medium text-gray-500 w-16">图片</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Color Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden xl:table-cell">Style Name</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">单价 (USD)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">数量</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">合计 (USD)</th>
                {shipDates.map((date, i) => (
                  <th key={i} className="px-4 py-3 text-right font-medium text-gray-600 min-w-28">
                    <div>分批发货 {i + 1}</div>
                    <div className="text-xs font-normal text-gray-400">{date}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-gray-600">备注</th>
              </tr>
            </thead>

            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7 + shipDates.length} className="text-center py-16 text-gray-400">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-sm">没有符合条件的明细</p>
                    <button onClick={handleReset} className="mt-2 text-sm text-blue-500 hover:underline">
                      清除筛选条件
                    </button>
                  </td>
                </tr>
              ) : (
                pageItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    {/* 图片 */}
                    <td className="px-3 py-2">
                      <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center flex-shrink-0">
                        <BagIcon />
                      </div>
                    </td>
                    {/* SKU */}
                    <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-64">
                      <span className="truncate block">{item.sku}</span>
                    </td>
                    {/* Color Name */}
                    <td className="px-4 py-2 text-gray-700 font-medium">{item.colorName}</td>
                    {/* Style Name */}
                    <td className="px-4 py-2 text-gray-500 hidden xl:table-cell">{item.styleName}</td>
                    {/* 单价 */}
                    <td className="px-4 py-2 text-right font-semibold text-red-500">
                      ${item.unitPrice.toFixed(2)}
                    </td>
                    {/* 数量 */}
                    <td className="px-4 py-2 text-right text-gray-700">{item.quantity}</td>
                    {/* 合计 */}
                    <td className="px-4 py-2 text-right text-gray-700">
                      ${(item.unitPrice * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    {/* 分批发货列 */}
                    {shipDates.map((_, di) => {
                      const qty = item.shipments[di]?.qty ?? null;
                      return (
                        <td key={di} className="px-4 py-2 text-right text-gray-600">
                          {qty === null ? <span className="text-gray-300">—</span> : qty}
                        </td>
                      );
                    })}
                    {/* 备注 */}
                    <td className="px-4 py-2 text-gray-400 text-xs">{item.remarks || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>

            {/* 汇总行 */}
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                  <td className="px-3 py-3 text-xs text-gray-500" colSpan={4}>合计（共 {filteredItems.length} 个 SKU）</td>
                  <td className="px-4 py-3 text-right hidden xl:table-cell" />
                  <td className="px-4 py-3 text-right">
                    {filteredItems.reduce((s, i) => s + i.quantity, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ${filteredItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
                      .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  {shipDates.map((_, di) => (
                    <td key={di} className="px-4 py-3 text-right">
                      {filteredItems.reduce((s, i) => s + (i.shipments[di]?.qty ?? 0), 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ========================================
          分页
          ======================================== */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span>共 {filteredItems.length} 条</span>
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
          <span className="ml-2 text-gray-500">前往</span>
          <input
            type="number" min={1} max={totalPages} value={page}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1 && v <= totalPages) setPage(v); }}
            className="w-12 text-center border border-gray-200 rounded-md px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-gray-500">页</span>
        </div>
      </div>

      {/* ===== 导入弹窗 ===== */}
      {importOpen && (
        <ImportDetailModal
          onClose={() => setImportOpen(false)}
          onConfirm={handleImportConfirm}
        />
      )}

      {/* ===== 未录入 SKU 提醒弹窗 ===== */}
      {unregAlert && unregAlert.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
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
              <button onClick={() => setUnregAlert(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
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
                onClick={() => setUnregAlert(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                我知道了
              </button>
              <button
                onClick={() => { setUnregAlert(null); router.push('/unregistered'); }}
                className="px-5 py-2 text-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                前往未录入页面
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ============================================================
 * 导入明细弹窗
 * 解析格式：SKU | Color Name | Style Name | EXW | EXW Cost | QTY | Ship date Start [date]...
 * ============================================================ */
interface ImportDetailModalProps {
  onClose: () => void;
  onConfirm: (data: OrderDetailData) => void;
}

type ImportStage = 'idle' | 'parsing' | 'done';
interface ImportResult { data: OrderDetailData | null; errors: string[] }

async function parseDetailExcel(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  /* 使用 header:1 拿到原始二维数组，方便解析表头 */
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  if (rawRows.length < 2) return { data: null, errors: ['文件为空或格式不正确'] };

  const headers = rawRows[0] as string[];
  const errors: string[] = [];

  /* --- 定位关键列 --- */
  const find = (kw: string) => headers.findIndex((h) => String(h ?? '').toLowerCase().includes(kw.toLowerCase()));
  const skuIdx    = find('sku');
  const colorIdx  = find('color');
  const styleIdx  = find('style');
  const exwIdx    = find('exw');
  const qtyIdx    = find('qty');

  if (skuIdx < 0) return { data: null, errors: ['未找到 SKU 列，请检查表头'] };

  /* --- 动态定位批次日期列（包含 "ship date"） --- */
  const shipCols: { idx: number; date: string }[] = [];
  headers.forEach((h, i) => {
    const hs = String(h ?? '').toLowerCase();
    if (hs.includes('ship date') || hs.includes('ship_date')) {
      const match = String(h).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      const date = match ? match[1] : `批次${shipCols.length + 1}`;
      shipCols.push({ idx: i, date });
    }
  });

  const items: OrderDetailItem[] = [];
  for (let ri = 1; ri < rawRows.length; ri++) {
    const row = rawRows[ri] as unknown[];
    const sku = String(row[skuIdx] ?? '').trim();
    if (!sku || sku.toLowerCase() === 'total' || sku === '') continue;

    const priceRaw = String(row[exwIdx] ?? '').replace(/[$,\s]/g, '');
    const unitPrice = parseFloat(priceRaw) || 0;
    const quantity  = parseInt(String(row[qtyIdx] ?? '0'), 10) || 0;

    const shipments: ShipmentBatch[] = shipCols.map(({ idx, date }) => {
      const val = row[idx];
      if (val === null || val === '' || val === '-' || val === '—') return { date, qty: null };
      const n = parseInt(String(val), 10);
      return { date, qty: isNaN(n) ? null : n };
    });

    if (!unitPrice && !quantity) {
      errors.push(`第 ${ri + 1} 行数据不完整，已跳过`);
      continue;
    }

    items.push({
      id: `imp_${ri}_${Date.now()}`,
      sku,
      colorName: String(row[colorIdx] ?? '').trim(),
      styleName: String(row[styleIdx] ?? '').trim(),
      unitPrice,
      quantity,
      shipments,
      remarks: '',
    });
  }

  if (items.length === 0) return { data: null, errors: ['未解析到有效明细行', ...errors] };

  return {
    data: { shipmentDates: shipCols.map((c) => c.date), items },
    errors,
  };
}

function ImportDetailModal({ onClose, onConfirm }: ImportDetailModalProps) {
  const [stage, setStage]       = useState<ImportStage>('idle');
  const [isDragging, setIsDrag] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult]     = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setResult({ data: null, errors: ['仅支持 .xlsx / .xls 格式'] });
      setStage('done');
      return;
    }
    setFileName(file.name);
    setStage('parsing');
    setResult(null);
    const res = await parseDetailExcel(file);
    setResult(res);
    setStage('done');
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    if (result?.data) { onConfirm(result.data); onClose(); }
  }

  function downloadTemplate() {
    const rows = [
      ['图片', 'SKU', 'Color Name', 'Style Name', 'EXW', 'EXW Cost', 'QTY', 'Ship date Start 4/15/26', 'Ship date Start 4/30/26'],
      ['', '26SP-W1694-1PRSE-TNC-BLU1-ONS', 'ROYAL BLUE/LIME', 'VANITY RALLY SHOULDER BAG', 13, 1040, 80, 50, 30],
      ['', '26SP-W1695-1PRSE-CRC-GRN1-ONS', 'MATCHA',          'RALLY SHOULDER BAG',        13, 1040, 80, '', 80],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch:8 },{ wch:36 },{ wch:16 },{ wch:26 },{ wch:8 },{ wch:12 },{ wch:8 },{ wch:20 },{ wch:20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单明细模板');
    XLSX.writeFile(wb, '订单明细导入模板.xlsx');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* 标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-800">导入订单明细</h2>
            <p className="text-xs text-gray-400 mt-0.5">格式：SKU · Color · Style · EXW · QTY · Ship date 列（动态）</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 上传区 */}
          {(stage === 'idle' || stage === 'parsing') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
              onDragLeave={() => setIsDrag(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={[
                'flex flex-col items-center justify-center gap-3 h-36 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
                stage === 'parsing' ? 'pointer-events-none opacity-60' : '',
              ].join(' ')}
            >
              {stage === 'parsing' ? (
                <>
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">正在解析 {fileName}...</p>
                </>
              ) : (
                <>
                  <div className="text-3xl">📂</div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">点击选择文件，或拖拽至此</p>
                    <p className="text-xs text-gray-400 mt-1">仅支持 .xlsx / .xls</p>
                  </div>
                </>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            className="hidden"
          />

          {/* 解析结果 */}
          {stage === 'done' && result && (
            <div className="space-y-3">
              {fileName && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>📄</span><span className="font-medium">{fileName}</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠ {result.errors.length} 条警告</p>
                  {result.errors.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
                </div>
              )}
              {result.data && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700 mb-2">✓ 解析成功</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">SKU 条数</span>
                      <p className="font-bold text-gray-800 text-lg">{result.data.items.length}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">批次数</span>
                      <p className="font-bold text-gray-800 text-lg">{result.data.shipmentDates.length}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">总数量</span>
                      <p className="font-bold text-gray-800 text-lg">
                        {result.data.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">总金额</span>
                      <p className="font-bold text-gray-800 text-lg">
                        ${result.data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
                          .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  {/* 批次日期 */}
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {result.data.shipmentDates.map((d, i) => (
                      <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        批次{i + 1}：{d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!result.data && result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-600">未解析到有效数据，请检查文件格式。</p>
                </div>
              )}
              <button
                onClick={() => { setStage('idle'); setFileName(''); setResult(null); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline text-center pt-1"
              >
                重新选择文件
              </button>
            </div>
          )}

          {/* 模板下载 */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>与实际收到的 Excel 格式完全一致</span>
            <button onClick={downloadTemplate} className="text-blue-500 hover:text-blue-700 underline">
              ↓ 下载导入模板
            </button>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >取消</button>
          <button
            onClick={handleConfirm}
            disabled={!result?.data}
            className={[
              'px-5 py-2 text-sm font-medium rounded-md transition-colors',
              result?.data ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            确认导入{result?.data ? ` (${result.data.items.length} 条)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
 * 内部小组件
 * ============================================================ */

const STATUS_STYLES: Record<OrderStatus, string> = {
  '已确认': 'bg-green-100  text-green-700',
  '待确认': 'bg-amber-100  text-amber-600',
  '部分发货': 'bg-blue-100  text-blue-700',
  '已发货': 'bg-teal-100   text-teal-700',
  '已取消': 'bg-gray-100   text-gray-500',
};
function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

function InfoItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={valueClass ?? 'text-base font-medium text-gray-800'}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-10 bg-gray-200 flex-shrink-0" />;
}

interface PageBtnProps { children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; }
function PageBtn({ children, onClick, active, disabled }: PageBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors',
        active   ? 'bg-blue-600 text-white font-medium' : '',
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
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
function CheckSmallIcon() {
  return (
    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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
function BagIcon() {
  return (
    <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}
