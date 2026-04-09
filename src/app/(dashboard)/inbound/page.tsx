'use client';

/* ============================================================
 * 入库管理页面
 * 展示待入库/已入库订单 SKU；需先点「编辑」再改入库数量，可撤回、保存
 * ============================================================ */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';
import { loadInventoryFromStorage } from '@/lib/inventoryStorage';
import { MOCK_PO_GROUPS } from '@/app/(dashboard)/inventory/_components/mockData';
import type { PoGroupData, SkuItem } from '@/app/(dashboard)/inventory/_components/mockData';
import { COLOR_NAME_MAP, COLOR_NAME_ZH_MAP } from '@/app/(dashboard)/products/_components/mockData';
import { resolveColorHex, swatchNeedsBorder } from '@/lib/colorDisplay';

function loadInventory(): PoGroupData[] {
  const fromStore = loadInventoryFromStorage();
  if (fromStore.length > 0) return fromStore;
  return MOCK_PO_GROUPS;
}

function saveInventory(data: PoGroupData[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(data));
  } catch { /* quota */ }
}

function shippedSum(item: SkuItem): number {
  return Object.values(item.shipments)
    .filter((v): v is number => v !== null)
    .reduce((sum, v) => sum + v, 0);
}

function recalcPoGroup(po: PoGroupData): PoGroupData {
  const items = po.items.map((item) => ({
    ...item,
    remaining: item.receivedQty - shippedSum(item),
  }));
  const totalQty = items.reduce((s, i) => s + i.totalQty, 0);
  const receivedQty = items.reduce((s, i) => s + i.receivedQty, 0);
  const remaining = items.reduce((s, i) => s + i.remaining, 0);
  return {
    ...po,
    items,
    skuCount: items.length,
    totalQty,
    receivedQty,
    remaining,
  };
}

type InboundStatus = '全部' | '待入库' | '部分入库' | '已入库' | '订单已完成';

/**
 * 入库侧：待入库 / 部分入库 / 已入库。
 * 当入库已达订单量且 PO 在「订单库存」中剩余可出库存为 0（已全部出货）时 → 订单已完成。
 */
function getPoInboundStatus(po: PoGroupData): InboundStatus {
  if (po.receivedQty === 0) return '待入库';
  if (po.receivedQty < po.totalQty) return '部分入库';
  if (po.remaining <= 0) return '订单已完成';
  return '已入库';
}

export default function InboundPage() {
  const [inventory, setInventory] = useState<PoGroupData[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InboundStatus>('全部');
  const [expandedPo, setExpandedPo] = useState<Set<string>>(new Set());

  /** 当前正在编辑的 PO 号；仅此时可改入库数量、可用「全部入库」 */
  const [editingPo, setEditingPo] = useState<string | null>(null);
  /** 编辑中的草稿（从该 PO 克隆） */
  const [draftPo, setDraftPo] = useState<PoGroupData | null>(null);
  /** 进入编辑时的快照，用于「撤回」 */
  const [baselinePo, setBaselinePo] = useState<PoGroupData | null>(null);

  const undoMgr = useUndoManager<PoGroupData[]>();

  useEffect(() => {
    const raw = loadInventory();
    setInventory(raw.map((po) => recalcPoGroup(po)));
  }, []);

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      setInventory(entry.snapshot);
      saveInventory(entry.snapshot);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

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

  const stats = useMemo(() => {
    const total = inventory.length;
    const pending = inventory.filter((po) => po.receivedQty === 0).length;
    const partial = inventory.filter((po) => po.receivedQty > 0 && po.receivedQty < po.totalQty).length;
    const done = inventory.filter(
      (po) => po.receivedQty >= po.totalQty && po.totalQty > 0 && po.remaining > 0,
    ).length;
    const orderDone = inventory.filter(
      (po) => po.receivedQty >= po.totalQty && po.totalQty > 0 && po.remaining <= 0,
    ).length;
    return { total, pending, partial, done, orderDone };
  }, [inventory]);

  const togglePo = useCallback((poNumber: string) => {
    setExpandedPo((prev) => {
      const next = new Set(prev);
      if (next.has(poNumber)) next.delete(poNumber);
      else next.add(poNumber);
      return next;
    });
  }, []);

  function displayPo(po: PoGroupData): PoGroupData {
    if (editingPo === po.poNumber && draftPo) return draftPo;
    return po;
  }

  function isDraftDirty(): boolean {
    if (!draftPo || !baselinePo) return false;
    return JSON.stringify(draftPo) !== JSON.stringify(baselinePo);
  }

  function startEdit(poNumber: string) {
    if (editingPo && editingPo !== poNumber && isDraftDirty()) {
      if (!window.confirm('当前订单有未保存的修改，确定切换到其他订单？未保存的修改将丢失。')) return;
    }
    const po = inventory.find((p) => p.poNumber === poNumber);
    if (!po) return;
    const copy = JSON.parse(JSON.stringify(po)) as PoGroupData;
    setEditingPo(poNumber);
    setDraftPo(copy);
    setBaselinePo(JSON.parse(JSON.stringify(po)) as PoGroupData);
    setExpandedPo((prev) => new Set(prev).add(poNumber));
  }

  function saveEdit() {
    if (!editingPo || !draftPo) return;
    undoMgr.push(inventory, `保存入库数据: ${editingPo}`);
    const merged = recalcPoGroup(draftPo);
    setInventory((prev) => {
      const idx = prev.findIndex((p) => p.poNumber === editingPo);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = merged;
      saveInventory(next);
      return next;
    });
    setEditingPo(null);
    setDraftPo(null);
    setBaselinePo(null);
  }

  /** 撤回：恢复为进入编辑时的数据（不退出编辑） */
  function withdrawDraft() {
    if (!baselinePo) return;
    setDraftPo(JSON.parse(JSON.stringify(baselinePo)) as PoGroupData);
  }

  /** 取消编辑：关闭编辑区且不保存 */
  function cancelEdit() {
    if (isDraftDirty()) {
      if (!window.confirm('有未保存的修改，确定放弃并退出编辑？')) return;
    }
    setEditingPo(null);
    setDraftPo(null);
    setBaselinePo(null);
  }

  function updateDraftItemReceived(poNumber: string, itemId: string, raw: string) {
    const v = Math.max(0, Math.floor(Number(raw) || 0));
    setDraftPo((d) => {
      if (!d || d.poNumber !== poNumber) return d;
      const items = d.items.map((item) => {
        if (item.id !== itemId) return item;
        const shipped = shippedSum(item);
        return { ...item, receivedQty: v, remaining: v - shipped };
      });
      return recalcPoGroup({ ...d, items });
    });
  }

  function applyFullInboundDraft(poNumber: string) {
    if (editingPo !== poNumber) return;
    setDraftPo((d) => {
      if (!d || d.poNumber !== poNumber) return d;
      const items = d.items.map((item) => {
        const shipped = shippedSum(item);
        return { ...item, receivedQty: item.totalQty, remaining: item.totalQty - shipped };
      });
      return recalcPoGroup({ ...d, items });
    });
  }

  function applyRowFullInboundDraft(poNumber: string, itemId: string) {
    if (editingPo !== poNumber) return;
    setDraftPo((d) => {
      if (!d || d.poNumber !== poNumber) return d;
      const items = d.items.map((item) => {
        if (item.id !== itemId) return item;
        const shipped = shippedSum(item);
        return { ...item, receivedQty: item.totalQty, remaining: item.totalQty - shipped };
      });
      return recalcPoGroup({ ...d, items });
    });
  }

  return (
    <div className="flex flex-col gap-4">

      <div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
          <Link href="/inventory" className="hover:text-gray-600">出入库管理</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">入库管理</span>
        </div>
        <h1 className="text-xl font-bold text-gray-800">入库管理</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          请先点击订单右侧「编辑」再填写入库数量；修改后可「撤回」恢复进入编辑时的数据，确认后点「保存」写入订单库存。
          当入库已达订单量且本 PO 在「订单库存」中剩余库存已全部出完时，状态显示为「订单已完成」。
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="全部订单" value={stats.total} accent="text-gray-700" bg="bg-gray-50" />
        <StatCard label="待入库" value={stats.pending} accent="text-amber-600" bg="bg-amber-50" />
        <StatCard label="部分入库" value={stats.partial} accent="text-blue-600" bg="bg-blue-50" />
        <StatCard label="已入库" value={stats.done} accent="text-green-600" bg="bg-green-50" />
        <StatCard label="订单已完成" value={stats.orderDone} accent="text-violet-700" bg="bg-violet-50" />
      </div>

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
            <option value="订单已完成">订单已完成</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setInventory(loadInventory().map((po) => recalcPoGroup(po)));
            setSearch('');
            setStatusFilter('全部');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <RefreshIcon /> 刷新
        </button>
      </div>

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
            const dp = displayPo(po);
            const status = getPoInboundStatus(dp);
            const variance = dp.totalQty - dp.receivedQty;
            const isEditingThis = editingPo === po.poNumber;

            return (
              <div key={po.poNumber} className="bg-white border border-gray-200 rounded-lg overflow-hidden">

                <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => togglePo(po.poNumber)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-0.5"
                      aria-label={isExpanded ? '折叠' : '展开'}
                    >
                      <span className={`inline-block text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    </button>
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-bold text-gray-800">{po.poNumber}</span>

                      {isEditingThis ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={withdrawDraft}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                          >
                            撤回
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            退出编辑
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(po.poNumber)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                        >
                          编辑
                        </button>
                      )}

                      <InboundStatusBadge status={status} />
                      <p className="text-xs text-gray-400 w-full sm:w-auto sm:ml-2">
                        下单日期: {po.orderDate} · {dp.skuCount} 个 SKU
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 text-sm flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-400">订单数量</p>
                      <p className="font-semibold text-gray-700">{dp.totalQty.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">已入库</p>
                      <p className={`font-semibold ${dp.receivedQty === 0 ? 'text-amber-500' : 'text-green-600'}`}>
                        {dp.receivedQty.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-400">差数</p>
                      <p className={`font-semibold ${variance > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {variance === 0 ? '—' : variance.toLocaleString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={!isEditingThis}
                      onClick={() => applyFullInboundDraft(po.poNumber)}
                      className={[
                        'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                        isEditingThis
                          ? 'text-green-600 border-green-200 hover:bg-green-50'
                          : 'text-gray-300 border-gray-100 cursor-not-allowed',
                      ].join(' ')}
                      title={isEditingThis ? '本 PO 全部 SKU 入库数量=订单数量' : '请先点击「编辑」'}
                    >
                      全部入库
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-10" />
                        <col className="w-14" />
                        <col className="min-w-[140px]" style={{ width: '19.6%' }} />
                        <col style={{ width: 88 }} />
                        <col style={{ width: 72 }} />
                        <col className="w-[8.5rem]" />
                        <col className="w-36" />
                        <col className="w-[8.5rem]" />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 118 }} />
                        <col className="w-[4.5rem]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2 text-left font-medium text-gray-500">#</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500">图片</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 align-middle">SKU</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500">Color</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500">颜色</th>
                          <th className="px-4 py-2 pr-5 text-right font-medium text-gray-500">订单数量</th>
                          <th className="px-5 py-2 text-right font-medium text-gray-500">入库数量</th>
                          <th className="px-5 py-2 pl-4 text-right font-medium text-gray-500">差数</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 w-32">工厂名称</th>
                          <th className="pl-2 pr-4 py-2 text-left font-medium text-gray-500">订单号</th>
                          <th className="px-4 py-2 text-center font-medium text-gray-500">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dp.items.map((item, idx) => {
                          const itemVariance = item.totalQty - item.receivedQty;
                          const colorZhText =
                            item.colorNameZh?.trim()
                            || (() => {
                              const c = item.colorCode?.trim();
                              return c && COLOR_NAME_ZH_MAP[c] ? COLOR_NAME_ZH_MAP[c] : '';
                            })()
                            || '—';
                          return (
                            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                              <td className="px-2 py-2">
                                <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <BagIcon className="w-6 h-6 text-gray-300" />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 font-mono text-sm text-gray-700 align-middle break-all min-w-0">{item.sku}</td>
                              <InboundColorEnCell item={item} />
                              <td
                                className="px-2 py-2 text-gray-800 text-xs truncate"
                                title={colorZhText !== '—' ? colorZhText : undefined}
                              >
                                {colorZhText}
                              </td>
                              <td className="px-4 py-2 pr-5 text-right text-gray-700 tabular-nums">{item.totalQty.toLocaleString()}</td>
                              <td className="px-5 py-2 text-right">
                                {isEditingThis ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.receivedQty}
                                    onChange={(e) => updateDraftItemReceived(po.poNumber, item.id, e.target.value)}
                                    className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                ) : (
                                  <span
                                    className={
                                      item.receivedQty === 0 ? 'text-amber-500' : 'text-green-600 font-semibold'
                                    }
                                  >
                                    {item.receivedQty.toLocaleString()}
                                  </span>
                                )}
                              </td>
                              <td className={`px-5 py-2 pl-4 text-right ${itemVariance > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                                {itemVariance === 0 ? '—' : itemVariance.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-gray-700 text-xs max-w-[7.5rem] truncate" title={item.factoryName ?? ''}>
                                {item.factoryName?.trim() ? item.factoryName : '—'}
                              </td>
                              <td className="pl-2 pr-4 py-2 text-gray-600 text-xs font-mono align-middle">{item.wo ?? '—'}</td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  type="button"
                                  disabled={!isEditingThis}
                                  onClick={() => applyRowFullInboundDraft(po.poNumber, item.id)}
                                  className={
                                    isEditingThis
                                      ? 'text-xs text-green-600 hover:text-green-800 hover:underline'
                                      : 'text-xs text-gray-300 cursor-not-allowed'
                                  }
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
                          <td className="px-3 py-2 text-xs text-gray-500" colSpan={5}>
                            合计（{dp.items.length} 个 SKU）
                          </td>
                          <td className="px-4 py-2 pr-5 text-right tabular-nums">{dp.totalQty.toLocaleString()}</td>
                          <td className="px-5 py-2 text-right text-green-600">{dp.receivedQty.toLocaleString()}</td>
                          <td className={`px-5 py-2 pl-4 text-right ${variance > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {variance === 0 ? '—' : variance.toLocaleString()}
                          </td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
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

      <UndoToast
        canUndo={undoMgr.canUndo}
        nextDescription={undoMgr.nextDescription}
        undoCount={undoMgr.undoCount}
        onUndo={handleUndo}
        lastUndone={undoMgr.lastUndone}
        onDismiss={undoMgr.dismissLastUndone}
      />
    </div>
  );
}

/** Color 列：色块 + 英文颜色名（与产品列表展示习惯一致） */
function InboundColorEnCell({ item }: { item: SkuItem }) {
  const hex = resolveColorHex(item.colorCode);
  const border = swatchNeedsBorder(item.colorCode, hex);
  const code = item.colorCode?.trim();
  const en =
    item.colorNameEn?.trim()
    || (code && COLOR_NAME_MAP[code] ? COLOR_NAME_MAP[code] : '')
    || '';
  return (
    <td className="px-2 py-2 align-top overflow-hidden max-w-[88px]">
      <div className="flex items-center gap-1 min-w-0">
        <span
          className="inline-block w-5 h-5 rounded-full shrink-0"
          style={{
            backgroundColor: hex,
            border: border ? '1px solid #d1d5db' : 'none',
          }}
          title={item.colorCode ?? ''}
        />
        <span className="text-xs text-gray-800 truncate leading-tight" title={en || undefined}>
          {en || '—'}
        </span>
      </div>
    </td>
  );
}

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
  '订单已完成': 'bg-violet-100 text-violet-800',
};

function InboundStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INBOUND_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function BagIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-6 h-6'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
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
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
