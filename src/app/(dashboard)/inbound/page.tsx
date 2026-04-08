'use client';

/* ============================================================
 * 入库管理页面
 * 展示所有待入库/已入库的订单 SKU，允许录入实际入库数量
 * ============================================================ */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { MOCK_PO_GROUPS } from '@/app/(dashboard)/inventory/_components/mockData';
import type { PoGroupData, SkuItem } from '@/app/(dashboard)/inventory/_components/mockData';

function loadInventory(): PoGroupData[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return MOCK_PO_GROUPS;
}

function saveInventory(data: PoGroupData[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(data));
  } catch { /* quota */ }
}

type InboundStatus = '全部' | '待入库' | '部分入库' | '已入库';

function getPoInboundStatus(po: PoGroupData): InboundStatus {
  if (po.receivedQty === 0) return '待入库';
  if (po.receivedQty < po.totalQty) return '部分入库';
  return '已入库';
}

export default function InboundPage() {
  const [inventory, setInventory] = useState<PoGroupData[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InboundStatus>('全部');
  const [expandedPo, setExpandedPo] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    setInventory(loadInventory());
  }, []);

  /* ===== 筛选 ===== */
  const filtered = useMemo(() => {
    return inventory.filter((po) => {
      if (statusFilter !== '全部' && getPoInboundStatus(po) !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const poMatch = po.poNumber.toLowerCase().includes(q);
        const skuMatch = po.items.some((i) => i.sku.toLowerCase().includes(q));
        if (!poMatch && !skuMatch) return false;
      }
      return true;
    });
  }, [inventory, search, statusFilter]);

  /* ===== 统计 ===== */
  const stats = useMemo(() => {
    const total = inventory.length;
    const pending = inventory.filter((po) => po.receivedQty === 0).length;
    const partial = inventory.filter((po) => po.receivedQty > 0 && po.receivedQty < po.totalQty).length;
    const done = inventory.filter((po) => po.receivedQty >= po.totalQty && po.totalQty > 0).length;
    return { total, pending, partial, done };
  }, [inventory]);

  /* ===== 展开/折叠 ===== */
  const togglePo = useCallback((poNumber: string) => {
    setExpandedPo((prev) => {
      const next = new Set(prev);
      if (next.has(poNumber)) next.delete(poNumber); else next.add(poNumber);
      return next;
    });
  }, []);

  /* ===== 更新单个 SKU 的入库数量 ===== */
  function updateReceivedQty(poNumber: string, itemId: string, newQty: number) {
    setInventory((prev) => {
      const updated = prev.map((po) => {
        if (po.poNumber !== poNumber) return po;
        const newItems = po.items.map((item) => {
          if (item.id !== itemId) return item;
          const shipped = Object.values(item.shipments)
            .filter((v): v is number => v !== null)
            .reduce((sum, v) => sum + v, 0);
          return {
            ...item,
            receivedQty: newQty,
            remaining: newQty - shipped,
          };
        });
        const newReceivedQty = newItems.reduce((s, i) => s + i.receivedQty, 0);
        const newRemaining = newItems.reduce((s, i) => s + i.remaining, 0);
        return {
          ...po,
          items: newItems,
          receivedQty: newReceivedQty,
          remaining: newRemaining,
        };
      });
      saveInventory(updated);
      return updated;
    });
  }

  /* ===== 一键全部入库（该 PO 下所有 SKU 入库数量 = 订单数量） ===== */
  function handleFullInbound(poNumber: string) {
    setInventory((prev) => {
      const updated = prev.map((po) => {
        if (po.poNumber !== poNumber) return po;
        const newItems = po.items.map((item) => {
          const shipped = Object.values(item.shipments)
            .filter((v): v is number => v !== null)
            .reduce((sum, v) => sum + v, 0);
          return {
            ...item,
            receivedQty: item.totalQty,
            remaining: item.totalQty - shipped,
          };
        });
        return {
          ...po,
          items: newItems,
          receivedQty: newItems.reduce((s, i) => s + i.receivedQty, 0),
          remaining: newItems.reduce((s, i) => s + i.remaining, 0),
        };
      });
      saveInventory(updated);
      return updated;
    });
  }

  /* ===== 编辑模式处理 ===== */
  function startEdit(cellKey: string, currentValue: number) {
    setEditingCell(cellKey);
    setEditValue(String(currentValue));
  }

  function commitEdit(poNumber: string, itemId: string) {
    const qty = parseInt(editValue, 10);
    if (!isNaN(qty) && qty >= 0) {
      updateReceivedQty(poNumber, itemId, qty);
    }
    setEditingCell(null);
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ===== 标题 ===== */}
      <div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
          <Link href="/inventory" className="hover:text-gray-600">出入库管理</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">入库管理</span>
        </div>
        <h1 className="text-xl font-bold text-gray-800">入库管理</h1>
        <p className="text-sm text-gray-400 mt-0.5">录入实际入库数量，入库后数据同步至订单库存</p>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="全部订单" value={stats.total} accent="text-gray-700" bg="bg-gray-50" />
        <StatCard label="待入库" value={stats.pending} accent="text-amber-600" bg="bg-amber-50" />
        <StatCard label="部分入库" value={stats.partial} accent="text-blue-600" bg="bg-blue-50" />
        <StatCard label="已入库" value={stats.done} accent="text-green-600" bg="bg-green-50" />
      </div>

      {/* ===== 筛选栏 ===== */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="搜索 PO 号 / SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-500 whitespace-nowrap">入库状态</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InboundStatus)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          >
            <option value="全部">全部</option>
            <option value="待入库">待入库</option>
            <option value="部分入库">部分入库</option>
            <option value="已入库">已入库</option>
          </select>
        </div>

        <button
          onClick={() => { setInventory(loadInventory()); setSearch(''); setStatusFilter('全部'); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <RefreshIcon /> 刷新
        </button>
      </div>

      {/* ===== PO 分组列表 ===== */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center text-gray-400">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-sm font-medium text-gray-600">没有符合条件的订单</p>
          <p className="text-xs text-gray-400 mt-1">导入订单明细后，订单会自动出现在此页面</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((po) => {
            const isExpanded = expandedPo.has(po.poNumber);
            const status = getPoInboundStatus(po);
            const variance = po.totalQty - po.receivedQty;

            return (
              <div key={po.poNumber} className="bg-white border border-gray-200 rounded-lg overflow-hidden">

                {/* PO 头部 */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => togglePo(po.poNumber)}
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{po.poNumber}</span>
                        <InboundStatusBadge status={status} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        下单日期: {po.orderDate} · {po.skuCount} 个 SKU
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">订单数量</p>
                      <p className="font-semibold text-gray-700">{po.totalQty.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">已入库</p>
                      <p className={`font-semibold ${po.receivedQty === 0 ? 'text-amber-500' : 'text-green-600'}`}>
                        {po.receivedQty.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">差数</p>
                      <p className={`font-semibold ${variance > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {variance === 0 ? '—' : variance.toLocaleString()}
                      </p>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleFullInbound(po.poNumber); }}
                      className="px-3 py-1.5 text-xs font-medium text-green-600 border border-green-200 rounded-md hover:bg-green-50 transition-colors"
                      title="一键全部入库"
                    >
                      全部入库
                    </button>
                  </div>
                </div>

                {/* SKU 明细表格 */}
                {isExpanded && (
                  <div className="border-t border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-2 text-left font-medium text-gray-500 w-12">#</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">公司订单号</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">订单数量</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">入库数量</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">差数</th>
                          <th className="px-4 py-2 text-center font-medium text-gray-500">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map((item, idx) => {
                          const cellKey = `${po.poNumber}||${item.id}`;
                          const isEditing = editingCell === cellKey;
                          const itemVariance = item.totalQty - item.receivedQty;

                          return (
                            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                              <td className="px-4 py-2 font-mono text-xs text-gray-700">{item.sku}</td>
                              <td className="px-4 py-2 text-gray-600 text-xs">{item.wo ?? '—'}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{item.totalQty.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => commitEdit(po.poNumber, item.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitEdit(po.poNumber, item.id);
                                      if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    autoFocus
                                    className="w-20 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                ) : (
                                  <span
                                    onClick={() => startEdit(cellKey, item.receivedQty)}
                                    className={`cursor-pointer hover:bg-blue-50 px-2 py-1 rounded ${
                                      item.receivedQty === 0 ? 'text-amber-500' : 'text-green-600 font-semibold'
                                    }`}
                                    title="点击编辑"
                                  >
                                    {item.receivedQty.toLocaleString()}
                                  </span>
                                )}
                              </td>
                              <td className={`px-4 py-2 text-right ${itemVariance > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                                {itemVariance === 0 ? '—' : itemVariance.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => updateReceivedQty(po.poNumber, item.id, item.totalQty)}
                                  className="text-xs text-green-500 hover:text-green-700 hover:underline"
                                  title="入库数量 = 订单数量"
                                >
                                  全部入库
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-700">
                          <td className="px-4 py-2 text-xs text-gray-500" colSpan={3}>
                            合计 ({po.items.length} 个 SKU)
                          </td>
                          <td className="px-4 py-2 text-right">{po.totalQty.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-green-600">{po.receivedQty.toLocaleString()}</td>
                          <td className={`px-4 py-2 text-right ${variance > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {variance === 0 ? '—' : variance.toLocaleString()}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
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

const INBOUND_STATUS_STYLES: Record<string, string> = {
  '待入库': 'bg-amber-100 text-amber-700',
  '部分入库': 'bg-blue-100 text-blue-700',
  '已入库': 'bg-green-100 text-green-700',
};

function InboundStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INBOUND_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
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
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
