'use client';

/* ============================================================
 * PO 分组组件
 *
 * 左侧固定列宽为全局常量（与 PO 无关、不随表格总宽拉伸）
 * 出库列：列间竖线（border-r）；横向滚动条由外层 overflow-x-auto 提供
 * ============================================================ */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PoGroupData } from './mockData';

interface PoGroupProps {
  data: PoGroupData;
  selectedIds: ReadonlySet<string>;
  onToggleItem: (id: string) => void;
  onToggleGroupAll: (itemIds: string[], selectAll: boolean) => void;
}

/** 原 SKU 列 220px 的 65%，与其它固定列一起仅由常量决定，任意 PO 一致 */
const SKU_COL_W = Math.round(220 * 0.65);

const FIXED_SPEC = [
  ['checkbox', 40],
  ['image', 56],
  ['sku', SKU_COL_W],
  /* 订单数量、入库数量、差数、剩余库存：原宽度的 1.5 倍 */
  ['totalQty', Math.round(80 * 1.5)],
  ['receivedQty', Math.round(80 * 1.5)],
  ['variance', Math.round(72 * 1.5)],
  ['remaining', Math.round(92 * 1.5)],
] as const;

type FixedKey = (typeof FIXED_SPEC)[number][0];

const FIXED_LAYOUT: Record<FixedKey, { left: number; width: number }> = (() => {
  let acc = 0;
  const o = {} as Record<FixedKey, { left: number; width: number }>;
  for (const [key, w] of FIXED_SPEC) {
    o[key] = { left: acc, width: w };
    acc += w;
  }
  return o;
})();

const FIXED_TOTAL_WIDTH = FIXED_SPEC.reduce((s, [, w]) => s + w, 0);

/** 出库列宽：原 116px 的 1.5 倍 */
const DYNAMIC_COL_WIDTH = Math.round(116 * 1.5);

const TRAIL_WO = 110;
const TRAIL_PATTERN = 88;
const RAIL_W = 44;

function outboundDisplayLabel(shipmentNo: string | null | undefined): string {
  return shipmentNo?.trim() ? shipmentNo.trim() : '未填写';
}

export default function PoGroup({ data, selectedIds, onToggleItem, onToggleGroupAll }: PoGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [prodMetaOpen, setProdMetaOpen] = useState(false);

  const itemIds = data.items.map((i) => i.id);
  const allChecked   = data.items.length > 0 && data.items.every((i) => selectedIds.has(i.id));
  const someChecked  = !allChecked && data.items.some((i) => selectedIds.has(i.id));

  function toggleSelectAll() {
    onToggleGroupAll(itemIds, !allChecked);
  }

  function stickyStyle(key: FixedKey, isHeader = false): React.CSSProperties {
    const { left, width } = FIXED_LAYOUT[key];
    return {
      position: 'sticky',
      left,
      width,
      minWidth: width,
      maxWidth: width,
      zIndex: isHeader ? 3 : 1,
      background: isHeader ? '#f9fafb' : '#ffffff',
    };
  }

  const lastFixedStyle = (isHeader = false): React.CSSProperties => {
    const { left, width } = FIXED_LAYOUT.remaining;
    return {
      position: 'sticky',
      left,
      width,
      minWidth: width,
      maxWidth: width,
      zIndex: isHeader ? 3 : 1,
      background: isHeader ? '#f9fafb' : '#ffffff',
      boxShadow: '4px 0 6px -2px rgba(0,0,0,0.08)',
    };
  };

  const tableMinWidth = useMemo(
    () =>
      FIXED_TOTAL_WIDTH +
      data.columns.length * DYNAMIC_COL_WIDTH +
      (prodMetaOpen ? TRAIL_WO + TRAIL_PATTERN : 0),
    [data.columns.length, prodMetaOpen]
  );

  /** 出库列：列间竖线 */
  const shipmentCellClass =
    'border-r border-gray-200 bg-white px-3 py-3 align-top';

  /** 数量区竖线：订单数量 / 入库数量 / 差数 右侧 */
  const qtyColSep = 'border-r border-gray-200';
  /** 剩余库存 与 出库区 之间的加强分隔线 */
  const remainingOutboundSep = 'border-r-2 border-gray-300';

  return (
    <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden bg-white">

      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▶
          </button>
          <span className="font-semibold text-gray-800">{data.poNumber}</span>
          <span className="text-sm text-gray-500">下单日期：{data.orderDate}</span>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>SKU数量：<b className="text-gray-700">{data.skuCount}</b></span>
          <span>订单总数量：<b className="text-gray-700">{data.totalQty.toLocaleString()}</b></span>
          <span>
            剩余库存：
            <b className={data.remaining > 0 ? 'text-orange-500' : 'text-gray-400'}>
              {data.remaining.toLocaleString()}
            </b>
          </span>
          <button className="flex items-center gap-1 px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">
            ↗ 分享
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex w-full min-w-0">
          <div className="min-w-0 flex-1 overflow-x-auto">
            {/*
              固定宽度 = tableMinWidth，禁止 w-full 拉伸，避免不同 PO 因总宽不同被浏览器重新分配列宽
            */}
            <table
              className="border-collapse text-sm"
              style={{
                tableLayout: 'fixed',
                width: tableMinWidth,
                minWidth: tableMinWidth,
              }}
            >

              <colgroup>
                {FIXED_SPEC.map(([key]) => (
                  <col key={key} style={{ width: FIXED_LAYOUT[key as FixedKey].width }} />
                ))}
                {data.columns.map((col) => (
                  <col key={col.key} style={{ width: DYNAMIC_COL_WIDTH }} />
                ))}
                {prodMetaOpen && (
                  <>
                    <col style={{ width: TRAIL_WO }} />
                    <col style={{ width: TRAIL_PATTERN }} />
                  </>
                )}
              </colgroup>

              <thead>
                <tr className="border-b border-gray-200">

                  <th style={stickyStyle('checkbox', true)} className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      ref={(el) => { if (el) el.indeterminate = someChecked; }}
                      checked={allChecked}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 cursor-pointer"
                    />
                  </th>

                  <th style={stickyStyle('image', true)} className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                    主图
                  </th>

                  <th style={stickyStyle('sku', true)} className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                    SKU 编码
                  </th>

                  <th style={stickyStyle('totalQty', true)} className={`px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${qtyColSep}`}>
                    订单数量
                  </th>

                  <th style={stickyStyle('receivedQty', true)} className={`px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${qtyColSep}`}>
                    入库数量
                  </th>

                  <th
                    style={stickyStyle('variance', true)}
                    className={`px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${qtyColSep}`}
                    title="差数 = 订单数量 − 入库数量"
                  >
                    差数
                  </th>

                  <th style={lastFixedStyle(true)} className={`px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${remainingOutboundSep}`}>
                    剩余库存
                  </th>

                  {data.columns.map((col) => {
                    const hasOutbound = !!col.shipmentNo?.trim();
                    const label = outboundDisplayLabel(col.shipmentNo);
                    return (
                      <th
                        key={col.key}
                        style={{ width: DYNAMIC_COL_WIDTH, minWidth: DYNAMIC_COL_WIDTH }}
                        className={`${shipmentCellClass} text-center`}
                      >
                        <div className="text-xs font-medium text-gray-700">{col.date}</div>
                        <div
                          className={[
                            'text-xs mt-0.5',
                            hasOutbound ? 'text-gray-600' : 'text-amber-600 font-medium',
                          ].join(' ')}
                          title={hasOutbound ? label : '客户出库号尚未回填'}
                        >
                          {label}
                        </div>
                        <Link
                          href={
                            hasOutbound
                              ? `/packing-list?shipment=${encodeURIComponent(col.shipmentNo!)}`
                              : `/packing-list?po=${encodeURIComponent(data.poNumber)}`
                          }
                          className="text-[10px] text-blue-500 hover:underline block mt-1"
                        >
                          查看装箱单
                        </Link>
                      </th>
                    );
                  })}

                  {prodMetaOpen && (
                    <>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap border-l border-gray-200 bg-gray-50">
                        生产订单号
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap bg-gray-50">
                        纸格款号
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {data.items.map((item, rowIndex) => {
                  const isSelected = selectedIds.has(item.id);
                  const rowBg = isSelected ? '#eff6ff' : rowIndex % 2 === 0 ? '#ffffff' : '#fafafa';
                  const metaBg = isSelected ? '#eff6ff' : rowIndex % 2 === 0 ? '#fafafa' : '#f3f4f6';

                  const variance = item.totalQty - item.receivedQty;

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 hover:bg-blue-50 transition-colors"
                    >

                      <td style={{ ...stickyStyle('checkbox'), background: rowBg }} className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleItem(item.id)}
                          className="w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>

                      <td style={{ ...stickyStyle('image'), background: rowBg }} className="px-2 py-3">
                        {item.imageUrl
                          ? (
                            <img src={item.imageUrl} alt={item.sku}
                              className="w-9 h-9 object-cover rounded border border-gray-200" />
                          ) : (
                            <div className="w-9 h-9 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-300 text-xs">
                              无图
                            </div>
                          )
                        }
                      </td>

                      <td style={{ ...stickyStyle('sku'), background: rowBg }} className="px-3 py-3">
                        <span title={item.sku} className="text-gray-700 font-mono text-xs block truncate">
                          {item.sku}
                        </span>
                      </td>

                      <td style={{ ...stickyStyle('totalQty'), background: rowBg }} className={`px-3 py-3 text-left text-gray-700 text-sm ${qtyColSep}`}>
                        {item.totalQty.toLocaleString()}
                      </td>

                      <td style={{ ...stickyStyle('receivedQty'), background: rowBg }} className={`px-3 py-3 text-left text-gray-700 text-sm ${qtyColSep}`}>
                        {item.receivedQty.toLocaleString()}
                      </td>

                      <td
                        style={{ ...stickyStyle('variance'), background: rowBg }}
                        className={`px-3 py-3 text-left text-sm ${qtyColSep}`}
                      >
                        {variance === 0
                          ? <span className="text-gray-300">—</span>
                          : variance > 0
                            ? <span className="font-semibold text-orange-500">▼ {variance.toLocaleString()}</span>
                            : <span className="font-semibold text-blue-500">▲ {Math.abs(variance).toLocaleString()}</span>
                        }
                      </td>

                      <td style={{ ...lastFixedStyle(), background: rowBg }} className={`px-3 py-3 text-left font-medium ${remainingOutboundSep}`}>
                        {item.remaining < 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold">
                            ⚠ {item.remaining.toLocaleString()}
                          </span>
                        ) : item.remaining === 0 ? (
                          <span className="text-gray-400">0</span>
                        ) : (
                          <span className="text-green-600">{item.remaining.toLocaleString()}</span>
                        )}
                      </td>

                      {data.columns.map((col) => {
                        const qty = item.shipments[col.key];
                        return (
                          <td
                            key={col.key}
                            style={{ width: DYNAMIC_COL_WIDTH, minWidth: DYNAMIC_COL_WIDTH }}
                            className={`${shipmentCellClass} text-center text-gray-700`}
                          >
                            {qty === null || qty === undefined
                              ? <span className="text-gray-300">—</span>
                              : qty === 0
                                ? <span className="text-gray-400">0</span>
                                : qty.toLocaleString()
                            }
                          </td>
                        );
                      })}

                      {prodMetaOpen && (
                        <>
                          <td
                            className="px-2 py-3 whitespace-nowrap border-l border-gray-200"
                            style={{ background: metaBg }}
                          >
                            {item.wo
                              ? <span className="text-gray-700 font-mono text-xs">{item.wo}</span>
                              : <span className="text-gray-400 italic text-xs">未关联</span>
                            }
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap" style={{ background: metaBg }}>
                            {item.patternCode
                              ? <span className="text-gray-700 font-mono text-xs">{item.patternCode}</span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>

          <div
            className="flex shrink-0 flex-col items-center border-l border-gray-200 bg-gray-50 px-1 py-3"
            style={{ width: RAIL_W, alignSelf: 'stretch' }}
          >
            {prodMetaOpen ? (
              <button
                type="button"
                onClick={() => setProdMetaOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                title="折叠生产信息"
              >
                ▸
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setProdMetaOpen(true)}
                className="flex min-h-[72px] w-full flex-col items-center justify-center gap-0.5 rounded border border-dashed border-gray-300 py-2 text-[10px] leading-tight text-gray-500 hover:bg-gray-100"
                title="展开：生产订单号、纸格款号"
              >
                <span className="text-xs">◂</span>
                <span>展开</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
