/* ============================================================
 * 装箱单列表页面
 * URL: /packing-list
 * 展示所有装箱单，支持创建、查看、删除
 * ?shipment=SQ... 时按客户出库号筛选（与出货进度「查看装箱单」联动）
 * ============================================================ */

'use client';

import { Suspense, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';
import {
  loadPackingLists,
  savePackingLists,
  calcPackingListSummary,
  generatePackingListNo,
  generateId,
  type PackingListData,
} from '@/lib/packingListUtils';
import { MOCK_PO_GROUPS } from '@/app/(dashboard)/inventory/_components/mockData';
import type { PoGroupData } from '@/app/(dashboard)/inventory/_components/mockData';
import { loadInventoryFromStorage } from '@/lib/inventoryStorage';

function loadInventory(): PoGroupData[] {
  const data = loadInventoryFromStorage();
  return data.length > 0 ? data : MOCK_PO_GROUPS;
}

function PackingListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shipmentFilter = searchParams.get('shipment')?.trim() ?? '';
  const poFilter = searchParams.get('po')?.trim() ?? '';

  const [packingLists, setPackingLists] = useState<PackingListData[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inventory, setInventory] = useState<PoGroupData[]>([]);
  const undoMgr = useUndoManager<PackingListData[]>();

  useEffect(() => {
    startTransition(() => {
      setPackingLists(loadPackingLists());
      setInventory(loadInventory());
    });
  }, []);

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      setPackingLists(entry.snapshot);
      savePackingLists(entry.snapshot);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

  const displayedLists = useMemo(() => {
    let list = packingLists;
    if (poFilter) {
      list = list.filter((pl) => pl.po_number === poFilter);
    }
    if (shipmentFilter) {
      list = list.filter((pl) => pl.shipment_number === shipmentFilter);
    }
    return list;
  }, [packingLists, shipmentFilter, poFilter]);

  function handleDelete(id: string) {
    if (!confirm('确定删除此装箱单？删除后可撤回恢复。')) return;
    const target = packingLists.find((pl) => pl.id === id);
    undoMgr.push(packingLists, `删除装箱单: ${target?.po_number ?? id}`);
    const next = packingLists.filter((pl) => pl.id !== id);
    setPackingLists(next);
    savePackingLists(next);
  }

  function handleCreate(poNumber: string) {
    undoMgr.push(packingLists, `新建装箱单: ${poNumber}`);
    const newPl: PackingListData = {
      id: generateId(),
      packing_list_no: generatePackingListNo(),
      po_number: poNumber,
      shipment_number: null,
      shipment_date: null,
      status: 'draft',
      notes: null,
      created_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10),
      items: [],
      default_change_log: [],
    };
    const next = [newPl, ...packingLists];
    setPackingLists(next);
    savePackingLists(next);
    setShowCreateModal(false);
    router.push(`/packing-list/${newPl.id}`);
  }

  const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    applied: 'bg-green-100 text-green-700',
  };
  const STATUS_LABEL: Record<string, string> = {
    draft: '草稿',
    confirmed: '已确认',
    applied: '已应用',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">装箱单管理</h1>
          <span className="text-sm text-gray-400">创建和管理出货装箱单</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
        >
          + 新建装箱单
        </button>
      </div>

      {(shipmentFilter || poFilter) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-2 text-sm text-blue-900 flex flex-wrap items-center justify-between gap-3">
          <span>
            {poFilter && (
              <>
                筛选 PO：<span className="font-mono font-semibold">{poFilter}</span>
                {shipmentFilter ? ' · ' : ''}
              </>
            )}
            {shipmentFilter && (
              <>
                客户出库号：<span className="font-mono font-semibold">{shipmentFilter}</span>
              </>
            )}
            {displayedLists.length > 0
              ? ` · ${displayedLists.length} 条`
              : ' · 暂无匹配的装箱单'}
          </span>
          <Link href="/packing-list" className="text-blue-600 hover:underline shrink-0">
            清除筛选
          </Link>
        </div>
      )}

      {/* 装箱单列表 */}
      {packingLists.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center text-gray-400">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-sm font-medium text-gray-600">暂无装箱单</p>
          <p className="text-xs text-gray-400 mt-1">点击「新建装箱单」开始创建</p>
        </div>
      ) : displayedLists.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center text-gray-400">
          <p className="text-sm text-gray-600">
            {shipmentFilter
              ? `没有客户出库号为「${shipmentFilter}」的装箱单`
              : '暂无数据'}
          </p>
          <Link href="/packing-list" className="mt-3 inline-block text-sm text-blue-500 hover:underline">
            返回全部装箱单
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedLists.map((pl) => {
            const summary = calcPackingListSummary(pl.items);
            return (
              <div key={pl.id} className="bg-white border border-gray-200 rounded-lg px-5 py-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link
                      href={`/packing-list/${pl.id}`}
                      className="font-bold text-gray-800 hover:text-blue-600 transition-colors text-base"
                    >
                      {pl.po_number}
                    </Link>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[pl.status] ?? ''}`}>
                      {STATUS_LABEL[pl.status] ?? pl.status}
                    </span>
                    {pl.shipment_number && (
                      <span className="text-sm text-blue-600 font-mono">客户出库号: {pl.shipment_number}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
                    <span>{summary.totalCartons} 箱</span>
                    <span>{summary.totalPcs.toLocaleString()} pcs</span>
                    <span>{summary.totalWeight.toFixed(1)} kg</span>
                    <span>{summary.totalCbm.toFixed(2)} m³</span>
                    <span className="text-xs text-gray-400">{pl.created_at}</span>
                    <Link
                      href={`/packing-list/${pl.id}`}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      编辑
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(pl.id)}
                      className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <UndoToast
        canUndo={undoMgr.canUndo}
        nextDescription={undoMgr.nextDescription}
        undoCount={undoMgr.undoCount}
        onUndo={handleUndo}
        lastUndone={undoMgr.lastUndone}
        onDismiss={undoMgr.dismissLastUndone}
      />

      {/* 新建弹窗：选择PO */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
          role="presentation"
        >
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">选择PO创建装箱单</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-2">
              {inventory.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">暂无订单数据</p>
              ) : (
                inventory.map((po) => (
                  <button
                    key={po.poNumber}
                    type="button"
                    onClick={() => handleCreate(po.poNumber)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800">{po.poNumber}</span>
                      <span className="text-xs text-gray-400">{po.orderDate}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{po.skuCount} 个SKU · 订单总量 {po.totalQty.toLocaleString()}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PackingListPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-400">加载中…</div>}>
      <PackingListContent />
    </Suspense>
  );
}
