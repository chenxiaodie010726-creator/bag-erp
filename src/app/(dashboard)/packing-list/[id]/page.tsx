/* ============================================================
 * 装箱单详情/编辑页
 * URL: /packing-list/:id
 * ============================================================ */

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUndoManager, useUndoKeyboard } from '@/hooks/useUndoManager';
import UndoToast from '@/components/UndoToast';
import {
  loadPackingLists,
  savePackingLists,
  calcPackingListSummary,
  calcRowEffectivePcs,
  calcRowTotalAmount,
  calcRowTotalWeight,
  calcRowTotalCbm,
  calcCbmPerCarton,
  generateId,
  toInventoryDateFormat,
  type PackingListData,
  type PackingListItem,
  type PackingListDefaultChangeEntry,
} from '@/lib/packingListUtils';
import { buildSkuUnitPriceMapForPo } from '@/lib/poOrderPrice';
import { MOCK_PO_GROUPS } from '@/app/(dashboard)/inventory/_components/mockData';
import type { PoGroupData } from '@/app/(dashboard)/inventory/_components/mockData';
import { buildShipmentKey } from '@/app/(dashboard)/inventory/_components/mockData';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { loadInventoryFromStorage } from '@/lib/inventoryStorage';
import { resolveColorHex, swatchNeedsBorder } from '@/lib/colorDisplay';
import { COLOR_NAME_MAP } from '@/app/(dashboard)/products/_components/mockData';

function loadInventory(): PoGroupData[] {
  const data = loadInventoryFromStorage();
  return data.length > 0 ? data : MOCK_PO_GROUPS;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Build SKU → color/image map using English color names from product Color field */
function buildSkuColorMap(
  po: PoGroupData | null,
): Record<string, { colorCode: string; colorEn: string; imageUrl: string | null }> {
  const map: Record<string, { colorCode: string; colorEn: string; imageUrl: string | null }> = {};
  if (!po) return map;
  for (const item of po.items) {
    const code = item.colorCode ?? '';
    const raw = item.colorNameEn ?? COLOR_NAME_MAP[code] ?? code;
    const en = raw ? titleCase(raw) : '';
    map[item.sku] = { colorCode: code, colorEn: en, imageUrl: item.imageUrl ?? null };
  }
  return map;
}

const MIXED_GROUP_COLORS: Record<string, string> = {
  A: 'bg-purple-50 border-l-4 border-l-purple-400',
  B: 'bg-teal-50 border-l-4 border-l-teal-400',
  C: 'bg-amber-50 border-l-4 border-l-amber-400',
  D: 'bg-rose-50 border-l-4 border-l-rose-400',
  E: 'bg-indigo-50 border-l-4 border-l-indigo-400',
  F: 'bg-cyan-50 border-l-4 border-l-cyan-400',
};

function getMixedGroupStyle(group: string | null): string {
  if (!group) return '';
  return MIXED_GROUP_COLORS[group.toUpperCase()] ?? 'bg-yellow-50 border-l-4 border-l-yellow-400';
}

function getMixedGroupBadgeStyle(group: string): string {
  const styles: Record<string, string> = {
    A: 'bg-purple-100 text-purple-700',
    B: 'bg-teal-100 text-teal-700',
    C: 'bg-amber-100 text-amber-700',
    D: 'bg-rose-100 text-rose-700',
    E: 'bg-indigo-100 text-indigo-700',
    F: 'bg-cyan-100 text-cyan-700',
  };
  return styles[group.toUpperCase()] ?? 'bg-yellow-100 text-yellow-700';
}

function isItemShipping(item: PackingListItem): boolean {
  return item.carton_qty > 0 || item.pcs_per_carton > 0 || item.mixed_group != null;
}

export default function PackingListDetailPage() {
  const params = useParams();
  const plId = params.id as string;

  const [current, setCurrent] = useState<PackingListData | null>(null);
  const [inventory, setInventory] = useState<PoGroupData[]>([]);

  const [shipmentNumber, setShipmentNumber] = useState('');
  const [shipmentDate, setShipmentDate] = useState('');
  const [defaultsEditId, setDefaultsEditId] = useState<string | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState({ sku: '', unit_price: '' });
  const [operatorName, setOperatorName] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [showMixedModal, setShowMixedModal] = useState(false);
  const [mixedSelection, setMixedSelection] = useState<Set<string>>(new Set());
  const autoImportDone = useRef(false);

  useEffect(() => {
    setOperatorName(typeof window !== 'undefined' ? (localStorage.getItem('cf_erp_operator_name') ?? '') : '');
  }, []);

  useEffect(() => {
    const lists = loadPackingLists();
    const found = lists.find((pl) => pl.id === plId) ?? null;
    setCurrent(found);
    if (found) {
      setShipmentNumber(found.shipment_number ?? '');
      setShipmentDate(found.shipment_date ?? '');
    }
    setInventory(loadInventory());
  }, [plId]);

  const poData = useMemo(() => {
    if (!current) return null;
    return inventory.find((po) => po.poNumber === current.po_number) ?? null;
  }, [current, inventory]);

  const skuColorMap = useMemo(() => buildSkuColorMap(poData), [poData]);

  const undoMgr = useUndoManager<PackingListData>();

  const saveCurrent = useCallback((updated: PackingListData, undoDesc?: string) => {
    if (undoDesc && current) {
      undoMgr.push(structuredClone(current), undoDesc);
    }
    const prev = loadPackingLists();
    const next = prev.map((pl) => (pl.id === updated.id ? updated : pl));
    savePackingLists(next);
    setCurrent(updated);
  }, [current, undoMgr]);

  const handleUndo = useCallback(() => {
    const entry = undoMgr.pop();
    if (entry) {
      const prev = loadPackingLists();
      const next = prev.map((pl) => (pl.id === entry.snapshot.id ? entry.snapshot : pl));
      savePackingLists(next);
      setCurrent(entry.snapshot);
    }
  }, [undoMgr]);

  useUndoKeyboard(handleUndo, undoMgr.canUndo);

  useEffect(() => {
    if (!current || !poData || autoImportDone.current) return;
    if (current.items.length > 0) return;

    autoImportDone.current = true;
    const priceMap = buildSkuUnitPriceMapForPo(current.po_number);
    const newItems: PackingListItem[] = poData.items.map((skuItem, idx) => {
      const up = priceMap[skuItem.sku] ?? 0;
      return {
        id: generateId(),
        packing_list_id: current.id,
        sku: skuItem.sku,
        ref_sku_from_po: skuItem.sku,
        ref_unit_price_from_po: up,
        carton_qty: 0,
        pcs_per_carton: 0,
        unit_price: up,
        gross_weight_per_carton: 0,
        product_weight: 0,
        carton_size: '',
        outer_carton_size: null,
        mixed_group: null,
        sort_order: idx,
        notes: null,
      };
    });
    if (newItems.length > 0) {
      saveCurrent({
        ...current,
        items: newItems,
        updated_at: new Date().toISOString().slice(0, 10),
      });
    }
  }, [current, poData, saveCurrent]);

  function handleDeleteRow(itemId: string) {
    if (!current) return;
    if (defaultsEditId === itemId) setDefaultsEditId(null);
    const target = current.items.find((i) => i.id === itemId);
    saveCurrent({ ...current, items: current.items.filter((i) => i.id !== itemId) }, `删除行: ${target?.sku ?? itemId}`);
  }

  function isPoLockedRow(item: PackingListItem): boolean {
    return item.ref_sku_from_po != null;
  }

  function updateItem(itemId: string, field: keyof PackingListItem, value: string | number | null) {
    if (!current) return;
    const target = current.items.find((i) => i.id === itemId);
    if (!target) return;
    if (
      (field === 'sku' || field === 'unit_price') &&
      isPoLockedRow(target) &&
      defaultsEditId !== itemId
    ) {
      return;
    }
    const updated = current.items.map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, [field]: value };
    });
    saveCurrent({ ...current, items: updated });
  }

  function startEditDefaults(item: PackingListItem) {
    setDefaultsEditId(item.id);
    setDefaultsDraft({ sku: item.sku, unit_price: String(item.unit_price) });
  }

  function cancelEditDefaults() {
    setDefaultsEditId(null);
  }

  function commitEditDefaults(itemId: string, rowIndex: number) {
    if (!current) return;
    const item = current.items.find((i) => i.id === itemId);
    if (!item || !isPoLockedRow(item)) return;

    const newSku = defaultsDraft.sku.trim();
    const parsed = Number(defaultsDraft.unit_price);
    const newPrice = Number.isFinite(parsed) ? parsed : 0;

    const parts: string[] = [];
    if (item.sku !== newSku) {
      parts.push(`将 SKU 由「${item.sku || '（空）'}」改为「${newSku || '（空）'}」`);
    }
    if (item.unit_price !== newPrice) {
      parts.push(`将 单价 由 $${item.unit_price.toFixed(2)} 改为 $${newPrice.toFixed(2)}`);
    }
    if (parts.length === 0) {
      setDefaultsEditId(null);
      return;
    }

    const op = operatorName.trim() || '本地用户';
    const message = `第 ${rowIndex + 1} 行：${parts.join('；')}`;
    const entry: PackingListDefaultChangeEntry = {
      id: generateId(),
      at: new Date().toISOString(),
      operator: op,
      item_id: itemId,
      message,
    };

    const nextItems = current.items.map((i) =>
      i.id === itemId ? { ...i, sku: newSku, unit_price: newPrice } : i,
    );
    const prevLog = current.default_change_log ?? [];
    saveCurrent({
      ...current,
      items: nextItems,
      default_change_log: [entry, ...prevLog],
      updated_at: new Date().toISOString().slice(0, 10),
    }, `修改默认值: ${message}`);
    try {
      localStorage.setItem('cf_erp_operator_name', op);
    } catch { /* ignore */ }
    setDefaultsEditId(null);
  }

  function handleSaveShipmentInfo() {
    if (!current) return;
    saveCurrent({
      ...current,
      shipment_number: shipmentNumber.trim() || null,
      shipment_date: shipmentDate || null,
      updated_at: new Date().toISOString().slice(0, 10),
    }, '修改出货信息');
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }

  function handleSavePackingList() {
    if (!current) return;
    saveCurrent({
      ...current,
      updated_at: new Date().toISOString().slice(0, 10),
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }

  function handleConfirm() {
    if (!current) return;
    if (current.items.length === 0) {
      alert('装箱单没有明细，无法确认');
      return;
    }
    saveCurrent({ ...current, status: 'confirmed', updated_at: new Date().toISOString().slice(0, 10) }, '确认装箱单');
  }

  function handleApplyToShipment() {
    if (!current) return;
    const dateRaw = (shipmentDate || current.shipment_date || '').trim();
    if (!dateRaw) {
      alert('请先选择出货日期');
      return;
    }
    if (current.items.length === 0) {
      alert('装箱单没有明细');
      return;
    }

    const inv = loadInventory();
    const poIdx = inv.findIndex((po) => po.poNumber === current.po_number);
    if (poIdx < 0) {
      alert('未找到对应的PO订单');
      return;
    }

    const po = { ...inv[poIdx] };
    const shipDate = toInventoryDateFormat(dateRaw);
    const rawInbound = (shipmentNumber.trim() || current.shipment_number?.trim() || '');
    const keySuffix = rawInbound || current.id;
    const existingCol = po.columns.find((c) => c.key === buildShipmentKey(shipDate, keySuffix));
    const colKey = existingCol?.key ?? buildShipmentKey(shipDate, keySuffix);

    if (!existingCol) {
      po.columns = [
        ...po.columns,
        {
          shipmentId: `s-${Date.now()}`,
          date: shipDate,
          shipmentNo: rawInbound,
          key: colKey,
        },
      ].sort((a, b) => a.date.localeCompare(b.date));
    }

    const skuQtyMap = new Map<string, number>();
    for (const item of current.items) {
      if (!isItemShipping(item)) continue;
      const prev = skuQtyMap.get(item.sku) ?? 0;
      skuQtyMap.set(item.sku, prev + calcRowEffectivePcs(item));
    }

    po.items = po.items.map((skuItem) => {
      const qty = skuQtyMap.get(skuItem.sku);
      if (qty === undefined) return skuItem;
      const newShipments = { ...skuItem.shipments, [colKey]: qty };
      const shipped = Object.values(newShipments).filter((v): v is number => v !== null && v !== undefined).reduce((s, v) => s + v, 0);
      return {
        ...skuItem,
        shipments: newShipments,
        remaining: skuItem.receivedQty - shipped,
      };
    });

    po.remaining = po.items.reduce((s, i) => s + i.remaining, 0);

    inv[poIdx] = po;
    try {
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inv));
    } catch { /* quota */ }

    saveCurrent({
      ...current,
      status: 'applied',
      shipment_date: dateRaw.includes('-') ? dateRaw : shipDate.replace(/\//g, '-'),
      updated_at: new Date().toISOString().slice(0, 10),
    });

    const outboundHint = rawInbound || '（未填写，可稍后在出货进度补充）';
    alert(`已成功应用到出货进度！\n客户出库号: ${outboundHint}\n涉及 ${skuQtyMap.size} 个SKU`);
  }

  function getNextMixedGroup(): string {
    if (!current) return 'A';
    const usedGroups = new Set(current.items.map((i) => i.mixed_group?.toUpperCase()).filter(Boolean));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of letters) {
      if (!usedGroups.has(letter)) return letter;
    }
    return 'A';
  }

  function handleOpenMixedModal() {
    setMixedSelection(new Set());
    setShowMixedModal(true);
  }

  function toggleMixedSelection(sku: string) {
    setMixedSelection((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function handleConfirmMixed() {
    if (!current || mixedSelection.size < 2) {
      alert('请至少选择 2 个 SKU 进行混装');
      return;
    }
    const group = getNextMixedGroup();
    const priceMap = buildSkuUnitPriceMapForPo(current.po_number);
    const existingSkus = new Set(current.items.map((i) => i.sku));
    const newItems: PackingListItem[] = [];

    for (const sku of mixedSelection) {
      if (existingSkus.has(sku)) {
        const updatedItems = current.items.map((item) => {
          if (item.sku !== sku) return item;
          return { ...item, mixed_group: group };
        });
        current.items = updatedItems;
      } else {
        const up = priceMap[sku] ?? 0;
        newItems.push({
          id: generateId(),
          packing_list_id: current.id,
          sku,
          ref_sku_from_po: sku,
          ref_unit_price_from_po: up,
          carton_qty: 0,
          pcs_per_carton: 0,
          unit_price: up,
          gross_weight_per_carton: 0,
          product_weight: 0,
          carton_size: '',
          outer_carton_size: null,
          mixed_group: group,
          sort_order: current.items.length + newItems.length,
          notes: null,
        });
      }
    }

    saveCurrent({
      ...current,
      items: [...current.items, ...newItems],
      updated_at: new Date().toISOString().slice(0, 10),
    });
    setShowMixedModal(false);
    setMixedSelection(new Set());
  }

  async function handleExportExcel() {
    if (!current || current.items.length === 0) {
      alert('装箱单没有明细，无法导出');
      return;
    }

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Packing List');

    ws.mergeCells('A1:N1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `装箱单 · ${current.po_number}`;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    ws.getCell('A2').value = `PO#: ${current.po_number}`;
    ws.getCell('A2').font = { bold: true };
    ws.getCell('E2').value = `客户出库号（inbound#）: ${current.shipment_number ?? '(待填)'}`;
    ws.getCell('E2').font = { bold: true };
    ws.getCell('I2').value = `Date: ${current.shipment_date ?? current.created_at}`;

    const headers = [
      'IMAGE', 'SKU', 'Color', 'CTNS', '@pcs', 'PCS', 'UNIT COST', 'AMOUNT',
      '@kg', 'KGS', '@mea(cm)', 'KGS(Net)', '@cbm', 'CBMS', 'Mixed',
    ];
    const headerRow = ws.addRow(headers);
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    const shippingItems = current.items.filter(isItemShipping);
    const notShippingItems = current.items.filter((i) => !isItemShipping(i));
    const summary = calcPackingListSummary(shippingItems);
    const dataStartRow = 4;

    for (let i = 0; i < shippingItems.length; i++) {
      const item = shippingItems[i];
      const totalPcs = calcRowEffectivePcs(item);
      const totalAmt = calcRowTotalAmount(item);
      const totalWt = calcRowTotalWeight(item);
      const cbmPer = calcCbmPerCarton(item.carton_size);
      const totalCbm = calcRowTotalCbm(item);
      const netWt = item.product_weight * totalPcs;
      const ci = skuColorMap[item.sku];
      const colorLabel = ci ? (ci.colorEn || ci.colorCode || '') : '';

      const row = ws.addRow([
        '',
        item.sku,
        colorLabel,
        item.carton_qty,
        item.pcs_per_carton,
        totalPcs,
        item.unit_price,
        totalAmt,
        item.gross_weight_per_carton,
        totalWt,
        item.carton_size,
        netWt,
        Number(cbmPer.toFixed(4)),
        Number(totalCbm.toFixed(4)),
        item.mixed_group ?? '',
      ]);
      row.height = 40;

      if (ci?.imageUrl) {
        try {
          const imgId = wb.addImage({ base64: ci.imageUrl.replace(/^data:image\/\w+;base64,/, ''), extension: 'png' });
          ws.addImage(imgId, {
            tl: { col: 0, row: dataStartRow + i - 1 },
            ext: { width: 36, height: 36 },
          });
        } catch { /* ignore non-base64 URLs */ }
      }

      const hexFill = ci ? resolveColorHex(ci.colorCode).replace('#', '') : '';
      if (hexFill && hexFill !== 'e5e7eb' && hexFill !== '9ca3af') {
        const colorCell = row.getCell(3);
        colorCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hexFill}` } };
        const isLight = (parseInt(hexFill.slice(0, 2), 16) * 299 + parseInt(hexFill.slice(2, 4), 16) * 587 + parseInt(hexFill.slice(4, 6), 16) * 114) / 1000 > 200;
        colorCell.font = { color: { argb: isLight ? 'FF333333' : 'FFFFFFFF' } };
      }

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    }

    const totalRow = ws.addRow([
      'TOTAL',
      '',
      '',
      summary.totalCartons,
      '',
      summary.totalPcs,
      '',
      summary.totalAmount,
      '',
      summary.totalWeight,
      '',
      '',
      '',
      Number(summary.totalCbm.toFixed(4)),
      '',
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    if (notShippingItems.length > 0) {
      const labelRow = ws.addRow(['本次不出货 SKU', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      labelRow.font = { bold: true, color: { argb: 'FF999999' } };
      for (const item of notShippingItems) {
        const ci = skuColorMap[item.sku];
        const colorLabel = ci ? (ci.colorEn || ci.colorCode || '') : '';
        const row = ws.addRow(['', item.sku, colorLabel, 0, 0, 0, item.unit_price, 0, 0, 0, '', 0, 0, 0, '']);
        row.font = { color: { argb: 'FF999999' } };
      }
    }

    ws.columns = [
      { width: 8 },
      { width: 30 },
      { width: 12 },
      { width: 8 },
      { width: 8 },
      { width: 10 },
      { width: 10 },
      { width: 12 },
      { width: 8 },
      { width: 10 },
      { width: 16 },
      { width: 10 },
      { width: 8 },
      { width: 10 },
      { width: 8 },
    ];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(current.po_number).replace(/[#/\\]/g, '_')}_装箱单.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-sm">装箱单不存在或已删除</p>
        <Link href="/packing-list" className="mt-3 text-sm text-blue-500 hover:underline">返回列表</Link>
      </div>
    );
  }

  const shippingItems = current.items.filter(isItemShipping);
  const notShippingItems = current.items.filter((i) => !isItemShipping(i));
  const summary = calcPackingListSummary(shippingItems);

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/packing-list" className="hover:text-gray-600">装箱单管理</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{current.po_number}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-xl font-bold text-gray-800">采购订单号: {current.po_number}</h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            current.status === 'draft' ? 'bg-amber-100 text-amber-700' :
            current.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {current.status === 'draft' ? '草稿' : current.status === 'confirmed' ? '已确认' : '已应用'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExportExcel} className="px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-gray-600">
            ↓ 导出Excel
          </button>
          {current.status === 'draft' && (
            <button type="button" onClick={handleConfirm} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium">
              确认装箱单
            </button>
          )}
          {(current.status === 'confirmed' || current.status === 'draft') && (
            <button type="button" onClick={handleApplyToShipment} className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium">
              应用到出货进度
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="min-w-[180px] max-w-[240px] shrink-0">
            <label className="block text-xs text-gray-500 font-medium mb-0.5">客户出库号（inbound#）</label>
            <input
              type="text"
              placeholder="客户返回后填入，如 SQ250510-001"
              value={shipmentNumber}
              onChange={(e) => setShipmentNumber(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono"
            />
          </div>
          <div className="w-[150px] shrink-0">
            <label className="block text-xs text-gray-500 font-medium mb-0.5">出货日期</label>
            <input
              type="date"
              value={shipmentDate}
              onChange={(e) => setShipmentDate(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <div className="min-w-0 flex-1 border-l border-gray-200 pl-4">
            <div className="flex w-full min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-2 rounded-lg border border-gray-100 bg-gray-50/90 px-5 py-3 sm:px-6 sm:py-3.5">
              <div className="text-center flex-1 min-w-[4.5rem] max-w-[7rem]">
                <div className="text-sm text-gray-500 mb-1.5">总箱数</div>
                <div className="text-base font-semibold text-gray-900 tabular-nums">{summary.totalCartons}</div>
              </div>
              <div className="text-center flex-1 min-w-[5rem] max-w-[8rem]">
                <div className="text-sm text-gray-500 mb-1.5">总数量</div>
                <div className="text-base font-semibold text-gray-900 tabular-nums">
                  {summary.totalPcs.toLocaleString()}
                  <span className="text-sm font-normal text-gray-500 ml-1">pcs</span>
                </div>
              </div>
              <div className="text-center flex-1 min-w-[5rem] max-w-[8rem]">
                <div className="text-sm text-gray-500 mb-1.5">总重量</div>
                <div className="text-base font-semibold text-gray-900 tabular-nums">
                  {summary.totalWeight.toFixed(1)}
                  <span className="text-sm font-normal text-gray-500 ml-1">kg</span>
                </div>
              </div>
              <div className="text-center flex-1 min-w-[5.5rem] max-w-[8rem]">
                <div className="text-sm text-gray-500 mb-1.5">总金额</div>
                <div className="text-base font-semibold text-gray-900 tabular-nums">${summary.totalAmount.toFixed(2)}</div>
              </div>
              <div className="text-center flex-1 min-w-[6rem] max-w-[9rem]">
                <div className="text-sm text-gray-500 mb-1.5">总立方</div>
                <div className="text-base font-semibold text-gray-900 tabular-nums">
                  {summary.totalCbm.toFixed(4)}
                  <span className="text-sm font-normal text-gray-500 ml-1">CBM</span>
                </div>
              </div>
            </div>
          </div>
          <button type="button" onClick={handleSaveShipmentInfo} className="shrink-0 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors font-medium">
            保存出库信息
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleOpenMixedModal} className="px-3 py-1.5 text-sm border border-purple-200 text-purple-700 rounded-md hover:bg-purple-50 transition-colors font-medium">
          + 添加混装
        </button>
        {savedFlash && (
          <span className="text-xs text-green-600 font-medium">已保存到本地</span>
        )}
        <button
          type="button"
          onClick={handleSavePackingList}
          className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
        >
          保存装箱单
        </button>
      </div>

      {/* ==================== Shipping items table ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left font-medium text-gray-500 w-8">#</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-12">图片</th>
              <th className="px-2 py-2 text-left font-medium text-gray-500 min-w-[180px]">SKU</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-24">Color</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-20">箱数</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-20">每箱数量</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500 w-20">总数量</th>
              <th
                className="px-2 py-2 text-center font-medium text-gray-500 w-24"
                title="从 PO 对应订单明细导入；修改需点「修改默认值（SKU/单价）」"
              >
                单价
                <span className="block text-[10px] font-normal text-gray-400 mt-0.5">（订单）</span>
              </th>
              <th className="px-2 py-2 text-right font-medium text-gray-500 w-24">总金额</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-24">毛重/箱(kg)</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500 w-24">总重量(kg)</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-32">纸箱尺寸(cm)</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500 w-20">@CBM</th>
              <th className="px-2 py-2 text-right font-medium text-gray-500 w-20">总CBM</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-16">混装组</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 w-12">操作</th>
            </tr>
          </thead>
          <tbody>
            {shippingItems.length === 0 && notShippingItems.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-12 text-center text-gray-400">
                  暂无明细，正在从 PO 同步 SKU…
                </td>
              </tr>
            ) : shippingItems.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-gray-400">
                  所有 SKU 箱数均为 0（本次不出货），请填写需出货 SKU 的箱数和每箱数量
                </td>
              </tr>
            ) : (
              shippingItems.map((item, idx) => {
                const totalPcs = calcRowEffectivePcs(item);
                const totalAmt = calcRowTotalAmount(item);
                const totalWt = calcRowTotalWeight(item);
                const cbmPer = calcCbmPerCarton(item.carton_size);
                const totalCbm = calcRowTotalCbm(item);
                const locked = isPoLockedRow(item);
                const isEditing = defaultsEditId === item.id;
                const editBlocked = defaultsEditId !== null && defaultsEditId !== item.id;
                const colorInfo = skuColorMap[item.sku];
                const hex = colorInfo ? resolveColorHex(colorInfo.colorCode) : '#e5e7eb';
                const light = colorInfo ? swatchNeedsBorder(colorInfo.colorCode, hex) : true;
                const mixedStyle = getMixedGroupStyle(item.mixed_group);

                return (
                  <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${mixedStyle}`}>
                    <td className="px-2 py-1.5 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-center">
                      {colorInfo?.imageUrl ? (
                        <img src={colorInfo.imageUrl} alt="" className="w-9 h-9 rounded-md object-cover mx-auto" />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-md flex items-center justify-center text-white text-xs mx-auto"
                          style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none', color: light ? '#666' : '#fff' }}
                        >
                          {'\uD83D\uDC5C'}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {locked && !isEditing && (
                        <>
                          <div className="text-sm font-mono text-gray-800 break-all">{item.sku}</div>
                          <button
                            type="button"
                            disabled={editBlocked}
                            onClick={() => startEditDefaults(item)}
                            className={[
                              'mt-1 text-[11px] leading-tight text-left',
                              editBlocked
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-blue-600 hover:underline',
                            ].join(' ')}
                          >
                            修改默认值（SKU/单价）
                          </button>
                        </>
                      )}
                      {locked && isEditing && (
                        <>
                          <input
                            type="text"
                            value={defaultsDraft.sku}
                            onChange={(e) => setDefaultsDraft((d) => ({ ...d, sku: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                            placeholder="SKU编码"
                          />
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            <button
                              type="button"
                              onClick={() => commitEditDefaults(item.id, idx)}
                              className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-700"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditDefaults}
                              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                            >
                              取消
                            </button>
                          </div>
                        </>
                      )}
                      {!locked && (
                        <input
                          type="text"
                          value={item.sku}
                          onChange={(e) => updateItem(item.id, 'sku', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                          placeholder="SKU编码"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {colorInfo ? (
                        <div className="flex items-center gap-1.5 justify-center">
                          <span
                            className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }}
                          />
                          <span className="text-xs text-gray-700">{colorInfo.colorEn || colorInfo.colorCode}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={item.carton_qty || ''}
                        onChange={(e) => updateItem(item.id, 'carton_qty', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={item.pcs_per_carton || ''}
                        onChange={(e) => updateItem(item.id, 'pcs_per_carton', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700 tabular-nums font-medium">
                      {totalPcs.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {locked && !isEditing && (
                        <div className="text-center text-sm tabular-nums text-gray-800 pt-0.5">
                          ${item.unit_price.toFixed(2)}
                        </div>
                      )}
                      {locked && isEditing && (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={defaultsDraft.unit_price}
                          onChange={(e) => setDefaultsDraft((d) => ({ ...d, unit_price: e.target.value }))}
                          className="w-full px-2 py-1 text-sm border border-blue-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      )}
                      {!locked && (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_price || ''}
                          onChange={(e) => updateItem(item.id, 'unit_price', Number(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700 tabular-nums">
                      {totalAmt > 0 ? `$${totalAmt.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={item.gross_weight_per_carton || ''}
                        onChange={(e) => updateItem(item.id, 'gross_weight_per_carton', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700 tabular-nums">
                      {totalWt > 0 ? totalWt.toFixed(1) : '-'}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={item.carton_size}
                        onChange={(e) => updateItem(item.id, 'carton_size', e.target.value)}
                        placeholder="如 55*48*40"
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600 tabular-nums text-xs">
                      {cbmPer > 0 ? cbmPer.toFixed(4) : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700 tabular-nums">
                      {totalCbm > 0 ? totalCbm.toFixed(4) : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {item.mixed_group ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${getMixedGroupBadgeStyle(item.mixed_group)}`}>
                          {item.mixed_group}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={item.mixed_group ?? ''}
                          onChange={(e) => updateItem(item.id, 'mixed_group', e.target.value.trim() || null)}
                          placeholder=""
                          maxLength={2}
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(item.id)}
                        className="text-red-400 hover:text-red-600 text-xs"
                        title="删除此行"
                      >
                        &#10005;
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {(shippingItems.length > 0 || notShippingItems.length > 0) && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-700">
                <td className="px-2 py-2 text-xs" colSpan={4}>合计</td>
                <td className="px-2 py-2 text-center">{summary.totalCartons}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right">{summary.totalPcs.toLocaleString()}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right">${summary.totalAmount.toFixed(2)}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right">{summary.totalWeight.toFixed(1)}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right">{summary.totalCbm.toFixed(4)}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ==================== Not shipping items ==================== */}
      {notShippingItems.length > 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg overflow-x-auto">
          <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs font-medium">
              {notShippingItems.length}
            </span>
            <span className="text-sm font-medium text-gray-500">本次不出货（箱数为 0）</span>
            <span className="text-xs text-gray-400 ml-1">— 填写箱数和每箱数量后自动移至出货列表</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {notShippingItems.map((item) => {
                const colorInfo = skuColorMap[item.sku];
                const hex = colorInfo ? resolveColorHex(colorInfo.colorCode) : '#e5e7eb';
                const light = colorInfo ? swatchNeedsBorder(colorInfo.colorCode, hex) : true;
                return (
                  <tr key={item.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                    <td className="px-3 py-2 w-12 text-center">
                      {colorInfo?.imageUrl ? (
                        <img src={colorInfo.imageUrl} alt="" className="w-8 h-8 rounded-md object-cover mx-auto opacity-60" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs mx-auto opacity-60"
                          style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none', color: light ? '#666' : '#fff' }}
                        >
                          {'\uD83D\uDC5C'}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 min-w-[180px]">
                      <div className="text-sm font-mono text-gray-500">{item.sku}</div>
                    </td>
                    <td className="px-2 py-2 w-24">
                      {colorInfo ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-3 h-3 rounded-full flex-shrink-0 opacity-60"
                            style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }}
                          />
                          <span className="text-xs text-gray-400">{colorInfo.colorEn || colorInfo.colorCode}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="px-2 py-2 w-24 text-center text-xs text-gray-400">
                      ${item.unit_price.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 w-20">
                      <input
                        type="number"
                        min={0}
                        value={item.carton_qty || ''}
                        onChange={(e) => updateItem(item.id, 'carton_qty', Number(e.target.value) || 0)}
                        placeholder="箱数"
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-2 py-2 w-20">
                      <input
                        type="number"
                        min={0}
                        value={item.pcs_per_carton || ''}
                        onChange={(e) => updateItem(item.id, 'pcs_per_carton', Number(e.target.value) || 0)}
                        placeholder="每箱"
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-2 py-2 w-12 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(item.id)}
                        className="text-red-300 hover:text-red-500 text-xs"
                        title="删除此行"
                      >
                        &#10005;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== Mixed packing modal ==================== */}
      {showMixedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMixedModal(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">添加混装组</h3>
                <p className="text-xs text-gray-400 mt-0.5">从订单 SKU 中选择 2 个以上进行混装</p>
              </div>
              <button type="button" onClick={() => setShowMixedModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
                &#10005;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {poData && poData.items.length > 0 ? (
                <div className="space-y-1">
                  {poData.items.map((skuItem) => {
                    const ci = skuColorMap[skuItem.sku];
                    const hex = ci ? resolveColorHex(ci.colorCode) : '#e5e7eb';
                    const light = ci ? swatchNeedsBorder(ci.colorCode, hex) : true;
                    const selected = mixedSelection.has(skuItem.sku);
                    const alreadyMixed = current?.items.some((i) => i.sku === skuItem.sku && i.mixed_group != null);

                    return (
                      <label
                        key={skuItem.sku}
                        className={[
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all',
                          alreadyMixed ? 'opacity-40 cursor-not-allowed' : '',
                          selected && !alreadyMixed ? 'bg-purple-50 ring-2 ring-purple-300' : 'hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          disabled={!!alreadyMixed}
                          checked={selected}
                          onChange={() => toggleMixedSelection(skuItem.sku)}
                          className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        {ci?.imageUrl ? (
                          <img src={ci.imageUrl} alt="" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-md flex items-center justify-center text-xs flex-shrink-0"
                            style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none', color: light ? '#666' : '#fff' }}
                          >
                            {'\uD83D\uDC5C'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-mono text-gray-800 truncate">{skuItem.sku}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {ci && (
                              <div className="flex items-center gap-1">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: hex, border: light ? '1px solid #d1d5db' : 'none' }}
                                />
                                <span className="text-xs text-gray-500">{ci.colorEn || ci.colorCode}</span>
                              </div>
                            )}
                            {alreadyMixed && (
                              <span className="text-[10px] text-amber-600 font-medium">已在混装组中</span>
                            )}
                          </div>
                        </div>
                        {selected && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs">
                            &#10003;
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-400 text-sm">
                  未找到 PO 对应的 SKU 数据
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50/50 rounded-b-xl">
              <span className="text-xs text-gray-500">
                已选 <span className="font-semibold text-purple-600">{mixedSelection.size}</span> 个 SKU
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowMixedModal(false)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMixed}
                  disabled={mixedSelection.size < 2}
                  className={[
                    'px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
                    mixedSelection.size >= 2
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                  ].join(' ')}
                >
                  确认混装 ({mixedSelection.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Change log ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-800">修改记录</h3>
          <label className="text-xs text-gray-500 flex items-center gap-2 shrink-0">
            <span>操作员署名</span>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              onBlur={() => {
                try {
                  localStorage.setItem('cf_erp_operator_name', operatorName.trim());
                } catch { /* ignore */ }
              }}
              placeholder="写入修改记录时署名"
              className="border border-gray-200 rounded px-2 py-1 text-xs w-44 text-gray-800"
            />
          </label>
        </div>
        {(current.default_change_log?.length ?? 0) === 0 ? (
          <p className="text-xs text-gray-400 py-2">暂无修改记录（修改 PO 导入行的 SKU 或 单价 后将在此留痕）</p>
        ) : (
          <ul className="space-y-2 text-xs text-gray-700 border-t border-gray-100 pt-3">
            {(current.default_change_log ?? []).map((entry) => (
              <li key={entry.id} className="leading-relaxed">
                <span className="text-gray-400">
                  {new Date(entry.at).toLocaleString('zh-CN', { hour12: false })}
                </span>
                <span className="mx-1.5 text-gray-300">&middot;</span>
                <span className="font-medium text-gray-600">{entry.operator}</span>
                <span className="mx-1">：</span>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
