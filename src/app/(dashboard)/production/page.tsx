'use client';

/* ============================================================
 * 生产单管理 — 列表页面（按PO分组 → 展开看款号 → 点击进详情）
 *
 * 核心流程：
 *   1. 页面加载时自动扫描所有客户订单 + 成本核算表
 *   2. 为每个款号生成生产单（有无成本表都生成），状态=未审核
 *   3. 按PO分组展示；高亮缺成本表的款号
 *   4. 缺成本表的款号可直接「录入成本表」（复用成本核算表导入逻辑）
 * ============================================================ */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  loadProductionOrders,
  saveProductionOrders,
  autoGenerateProductionOrders,
  groupProductionOrdersByPO,
  deleteProductionOrder,
  regenerateProcurementForPattern,
} from '@/lib/productionOrderUtils';
import { saveCostSheets, loadCostSheets } from '@/lib/costSheetUtils';
import type {
  ProductionOrder,
  ProductionOrderStatus,
  CostSheet,
} from '@/types';

const STATUS_MAP: Record<ProductionOrderStatus, string> = {
  unreviewed: '未审核',
  reviewed: '已审核',
};

const STATUS_COLORS: Record<ProductionOrderStatus, string> = {
  unreviewed: 'bg-orange-100 text-orange-700',
  reviewed: 'bg-green-100 text-green-700',
};

export default function ProductionPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [expandedPOs, setExpandedPOs] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | 'all'>('all');
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState('');

  /* 录入成本表用的 file input */
  const fileRef = useRef<HTMLInputElement>(null);
  const [importingForPattern, setImportingForPattern] = useState<string | null>(null);

  /* 初始加载 + 自动生成 */
  useEffect(() => {
    const existing = loadProductionOrders();
    setOrders(existing);
    const newOrders = autoGenerateProductionOrders();
    if (newOrders.length > 0) {
      setOrders(loadProductionOrders());
      setGenMessage(`自动生成了 ${newOrders.length} 张生产单`);
      setTimeout(() => setGenMessage(''), 4000);
    }
  }, []);

  /* 手动触发重新生成 */
  const handleRegenerate = useCallback(() => {
    setGenerating(true);
    const newOrders = autoGenerateProductionOrders();
    setOrders(loadProductionOrders());
    if (newOrders.length > 0) {
      setGenMessage(`新生成了 ${newOrders.length} 张生产单`);
    } else {
      setGenMessage('没有新的生产单需要生成');
    }
    setTimeout(() => setGenMessage(''), 4000);
    setGenerating(false);
  }, []);

  /* 展开/折叠PO */
  const togglePO = useCallback((poNumber: string) => {
    setExpandedPOs(prev => ({ ...prev, [poNumber]: !prev[poNumber] }));
  }, []);

  /* 删除生产单 */
  const handleDelete = useCallback((id: string) => {
    if (!confirm('确定要删除这张生产单吗？')) return;
    deleteProductionOrder(id);
    setOrders(loadProductionOrders());
  }, []);

  /* 审核/取消审核 */
  const handleToggleStatus = useCallback((id: string) => {
    const all = loadProductionOrders();
    const target = all.find(o => o.id === id);
    if (!target) return;
    target.status = target.status === 'unreviewed' ? 'reviewed' : 'unreviewed';
    target.updated_at = new Date().toISOString();
    saveProductionOrders(all);
    setOrders([...all]);
  }, []);

  /* ---- 录入成本表 ---- */
  const handleImportCostSheet = useCallback((patternCode: string) => {
    setImportingForPattern(patternCode);
    // 延迟触发以确保 state 更新
    setTimeout(() => fileRef.current?.click(), 50);
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !importingForPattern) return;

    try {
      const XLSX = await import('xlsx');
      const { parseCostSheetExcel } = await import('@/lib/costSheetImport');

      const existingSheets = loadCostSheets();
      const newSheets: CostSheet[] = [];

      for (const file of Array.from(files)) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const mainSheet = wb.Sheets[wb.SheetNames[0]];
        const mainRows = XLSX.utils.sheet_to_json(mainSheet, { header: 1 }) as (string | number | null)[][];

        let colorRows: (string | number | null)[][] | null = null;
        if (wb.SheetNames.length >= 2) {
          const colorSheet = wb.Sheets[wb.SheetNames[1]];
          colorRows = XLSX.utils.sheet_to_json(colorSheet, { header: 1 }) as (string | number | null)[][];
        }

        const parsed = parseCostSheetExcel(mainRows, colorRows);
        if (!parsed.pattern_code) {
          // 如果Excel没有款号，用当前选中的款号
          parsed.pattern_code = importingForPattern;
        }

        // 版本号
        const matching = [...existingSheets, ...newSheets].filter(
          s => s.pattern_code === parsed.pattern_code
        );
        if (matching.length > 0) {
          const maxV = Math.max(...matching.map(s => s.version));
          parsed.version = maxV + 1;
        }

        newSheets.push(parsed);
      }

      if (newSheets.length > 0) {
        const all = [...newSheets, ...existingSheets];
        saveCostSheets(all);

        // 为该款号的生产单重新生成采购单
        const updated = regenerateProcurementForPattern(importingForPattern);
        setOrders(loadProductionOrders());

        alert(`成功导入 ${newSheets.length} 个成本表！已为 ${updated.length} 张生产单生成采购单。`);
      }
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'));
    }

    setImportingForPattern(null);
    e.target.value = '';
  }, [importingForPattern]);

  /* 按PO分组 */
  const poGroups = useMemo(() => {
    let filtered = orders;
    if (statusFilter !== 'all') {
      filtered = orders.filter(o => o.status === statusFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(o =>
        o.order_number.toLowerCase().includes(s) ||
        o.po_number.toLowerCase().includes(s) ||
        o.pattern_code.toLowerCase().includes(s)
      );
    }
    return groupProductionOrdersByPO(filtered);
  }, [orders, search, statusFilter]);

  /* 统计 */
  const stats = useMemo(() => {
    const noCostSheet = orders.filter(o => !o.cost_sheet_id).length;
    return {
      total: orders.length,
      unreviewed: orders.filter(o => o.status === 'unreviewed').length,
      reviewed: orders.filter(o => o.status === 'reviewed').length,
      poCount: new Set(orders.map(o => o.po_number)).size,
      noCostSheet,
    };
  }, [orders]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.xlsm"
        multiple
        hidden
        onChange={handleFileUpload}
      />

      {/* 标题区 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">生产单管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            系统自动从客户订单 + 成本核算表生成生产单和采购单
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={generating}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {generating ? '生成中...' : '🔄 重新扫描生成'}
        </button>
      </div>

      {/* 生成提示 */}
      {genMessage && (
        <div className="mb-4 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg text-sm flex items-center gap-2">
          <span>ℹ️</span>
          <span>{genMessage}</span>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">PO总数</div>
          <div className="text-2xl font-bold mt-1">{stats.poCount}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">生产单总数</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">未审核</div>
          <div className="text-2xl font-bold mt-1 text-orange-600">{stats.unreviewed}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">已审核</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{stats.reviewed}</div>
        </div>
        <div className={`border rounded-lg p-4 ${stats.noCostSheet > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <div className="text-xs text-gray-500">缺成本表</div>
          <div className={`text-2xl font-bold mt-1 ${stats.noCostSheet > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {stats.noCostSheet}
          </div>
        </div>
      </div>

      {/* 搜索 + 筛选 */}
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="搜索PO号、生产单号、款号..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="flex gap-1">
          {(['all', 'unreviewed', 'reviewed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {s === 'all' ? '全部' : STATUS_MAP[s]}
            </button>
          ))}
        </div>
      </div>

      {/* PO分组列表 */}
      {poGroups.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-lg mb-2">暂无生产单</div>
          <div className="text-sm">
            请先在"订单总览"导入客户订单，系统将自动生成生产单。
            <br />有对应成本核算表的款号会自动生成采购单。
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {poGroups.map(group => {
            const isExpanded = !!expandedPOs[group.poNumber];
            const missingCostCount = group.orders.filter(o => !o.cost_sheet_id).length;
            const hasMissing = missingCostCount > 0;

            return (
              <div
                key={group.poNumber}
                className={`bg-white border rounded-lg overflow-hidden ${hasMissing ? 'border-orange-300' : ''}`}
              >
                {/* PO行 - 点击展开 */}
                <button
                  onClick={() => togglePO(group.poNumber)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-xs text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-gray-800">{group.poNumber}</span>
                        <span className="text-xs text-gray-400">{group.orderDate}</span>
                        {hasMissing && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                            {missingCostCount} 款缺成本表
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{group.patternCount} 个款号</span>
                        <span>·</span>
                        <span>{group.colorCount} 个颜色</span>
                        <span>·</span>
                        <span>总数量 {group.totalQty}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.statusSummary.unreviewed > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        {group.statusSummary.unreviewed} 未审核
                      </span>
                    )}
                    {group.statusSummary.reviewed > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {group.statusSummary.reviewed} 已审核
                      </span>
                    )}
                  </div>
                </button>

                {/* 展开的生产单列表 */}
                {isExpanded && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500 border-b text-xs">
                          <th className="py-2.5 px-5">生产单号</th>
                          <th className="py-2.5 px-4">纸格款号</th>
                          <th className="py-2.5 px-4">颜色</th>
                          <th className="py-2.5 px-4">总数量</th>
                          <th className="py-2.5 px-4">成本核算表</th>
                          <th className="py-2.5 px-4">状态</th>
                          <th className="py-2.5 px-4">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map(order => {
                          const totalQty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                          const colors = order.items?.map(i => i.color_zh || i.color_en).filter(Boolean) ?? [];
                          const hasCostSheet = !!order.cost_sheet_id;

                          return (
                            <tr
                              key={order.id}
                              className={`border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                                !hasCostSheet ? 'bg-red-50/50' : ''
                              }`}
                            >
                              <td className="py-3 px-5">
                                <Link
                                  href={`/production/${order.id}`}
                                  className="text-blue-600 hover:text-blue-800 font-medium font-mono text-xs"
                                >
                                  {order.order_number}
                                </Link>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                                  !hasCostSheet ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                                }`}>
                                  {order.pattern_code}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {colors.map((c, i) => (
                                    <span key={i} className="text-xs text-gray-600">{c}</span>
                                  ))}
                                  {colors.length === 0 && <span className="text-xs text-gray-400">-</span>}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-medium">{totalQty}</td>
                              <td className="py-3 px-4">
                                {hasCostSheet ? (
                                  <Link
                                    href={`/cost-sheet/${order.cost_sheet_id}`}
                                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                                  >
                                    ✓ 已关联
                                  </Link>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleImportCostSheet(order.pattern_code);
                                    }}
                                    className="px-2.5 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                                  >
                                    录入成本表
                                  </button>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                                  {STATUS_MAP[order.status]}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/production/${order.id}`}
                                    className="text-blue-600 hover:text-blue-800 text-xs"
                                  >
                                    详情
                                  </Link>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggleStatus(order.id); }}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                  >
                                    {order.status === 'unreviewed' ? '审核' : '取消审核'}
                                  </button>
                                  {order.status === 'unreviewed' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                                      className="text-red-500 hover:text-red-700 text-xs"
                                    >
                                      删除
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
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
