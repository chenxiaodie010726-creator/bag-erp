'use client';

/* ============================================================
 * PO 分组组件（含横向滚动 + 左侧固定列）
 *
 * 关键技术：CSS sticky position
 *   - 固定列每个 th/td 设置 position: sticky + left: Xpx + zIndex + 背景色
 *   - 外层容器设置 overflow-x: auto 触发横向滚动
 *   - 固定列宽度固定，不使用 auto，避免错位
 *
 * 固定列宽度分配（合计 764px）：
 *   复选框    40px   left:   0
 *   生产订单号 120px  left:  40
 *   纸格款号   96px  left: 160
 *   主图      64px   left: 256
 *   SKU      260px   left: 320  ← 加宽，支持长编码如 26SP-W1678-1PRSE-AP1-BLK1-ONS-TK
 *   总数量    88px   left: 580
 *   剩余库存  96px   left: 668  ← 最后一列加右阴影
 * ============================================================ */

import { useState } from 'react';
import type { PoGroupData } from './mockData';

interface PoGroupProps {
  data: PoGroupData;
}

/* 固定列的宽度和 left 偏移配置（单位：px） */
const FIXED_COLS = [
  { key: 'checkbox',     width: 40,  left: 0   },
  { key: 'wo',           width: 120, left: 40  },
  { key: 'patternCode',  width: 96,  left: 160 },
  { key: 'image',        width: 64,  left: 256 },
  { key: 'sku',          width: 260, left: 320 },
  { key: 'totalQty',     width: 88,  left: 580 },
  { key: 'remaining',    width: 96,  left: 668 },
] as const;

const FIXED_TOTAL_WIDTH = 764;  // 固定列总宽度之和
const DYNAMIC_COL_WIDTH = 116;  // 动态出库列宽度

export default function PoGroup({ data }: PoGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelectAll() {
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function stickyStyle(left: number, width: number, isHeader = false): React.CSSProperties {
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

  /* 最后一个固定列（剩余库存）加右阴影 */
  const lastFixedStyle = (isHeader = false): React.CSSProperties => ({
    ...stickyStyle(668, 96, isHeader),
    boxShadow: '4px 0 6px -2px rgba(0,0,0,0.08)',
  });

  const allChecked = selected.size === data.items.length && data.items.length > 0;

  return (
    <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden bg-white">

      {/* ===== PO 分组头部 ===== */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▶
          </button>
          {/* PO号（客户订单号） */}
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

      {/* ===== 表格区域（仅在展开时显示） ===== */}
      {expanded && (
        <div className="overflow-x-auto">
          <table
            className="border-collapse text-sm"
            style={{ tableLayout: 'fixed', minWidth: `${FIXED_TOTAL_WIDTH + data.columns.length * DYNAMIC_COL_WIDTH}px` }}
          >

            {/* ---- 列宽声明 ---- */}
            <colgroup>
              {FIXED_COLS.map((col) => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              {data.columns.map((col) => (
                <col key={col.key} style={{ width: DYNAMIC_COL_WIDTH }} />
              ))}
            </colgroup>

            {/* ---- 表头 ---- */}
            <thead>
              <tr className="border-b border-gray-200">

                {/* 复选框 */}
                <th style={stickyStyle(0, 40, true)} className="px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 cursor-pointer"
                  />
                </th>

                {/* 生产订单号 */}
                <th style={stickyStyle(40, 120, true)} className="px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                  生产订单号
                </th>

                {/* 纸格款号 */}
                <th style={stickyStyle(160, 96, true)} className="px-3 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                  纸格款号
                </th>

                {/* 主图 */}
                <th style={stickyStyle(256, 64, true)} className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                  主图
                </th>

                {/* SKU编码（加宽） */}
                <th style={stickyStyle(320, 260, true)} className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                  SKU 编码
                </th>

                {/* 订单总数量 */}
                <th style={stickyStyle(580, 88, true)} className="px-3 py-3 text-right text-xs font-medium text-gray-500 whitespace-nowrap">
                  订单数量
                </th>

                {/* 剩余库存（最后固定列，加阴影） */}
                <th style={lastFixedStyle(true)} className="px-3 py-3 text-right text-xs font-medium text-gray-500 whitespace-nowrap">
                  剩余库存
                </th>

                {/* 动态出库列 */}
                {data.columns.map((col) => (
                  <th
                    key={col.key}
                    style={{ width: DYNAMIC_COL_WIDTH, minWidth: DYNAMIC_COL_WIDTH }}
                    className="px-3 py-3 text-center"
                  >
                    <div className="text-xs font-medium text-gray-700">{col.date}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{col.shipmentNo}</div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* ---- 表体 ---- */}
            <tbody>
              {data.items.map((item, rowIndex) => {
                const isSelected = selected.has(item.id);
                const rowBg = isSelected ? '#eff6ff' : rowIndex % 2 === 0 ? '#ffffff' : '#fafafa';

                return (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 hover:bg-blue-50 transition-colors"
                  >

                    {/* 复选框 */}
                    <td style={{ ...stickyStyle(0, 40), background: rowBg }} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="w-3.5 h-3.5 cursor-pointer"
                      />
                    </td>

                    {/* 生产订单号 */}
                    <td style={{ ...stickyStyle(40, 120), background: rowBg }} className="px-3 py-3 whitespace-nowrap">
                      {item.wo
                        ? <span className="text-gray-700 font-mono text-xs">{item.wo}</span>
                        : <span className="text-gray-400 italic text-xs">未关联</span>
                      }
                    </td>

                    {/* 纸格款号 */}
                    <td style={{ ...stickyStyle(160, 96), background: rowBg }} className="px-3 py-3 whitespace-nowrap">
                      {item.patternCode
                        ? <span className="text-gray-700 font-mono text-xs">{item.patternCode}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>

                    {/* 主图 */}
                    <td style={{ ...stickyStyle(256, 64), background: rowBg }} className="px-2 py-3">
                      {item.imageUrl
                        ? (
                          <img
                            src={item.imageUrl}
                            alt={item.sku}
                            className="w-9 h-9 object-cover rounded border border-gray-200"
                          />
                        ) : (
                          <div className="w-9 h-9 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-300 text-xs">
                            无图
                          </div>
                        )
                      }
                    </td>

                    {/* SKU编码（加宽，单行截断 + tooltip） */}
                    <td style={{ ...stickyStyle(320, 260), background: rowBg }} className="px-3 py-3">
                      <span
                        title={item.sku}
                        className="text-gray-700 font-mono text-xs block truncate"
                      >
                        {item.sku}
                      </span>
                    </td>

                    {/* 订单总数量 */}
                    <td style={{ ...stickyStyle(580, 88), background: rowBg }} className="px-3 py-3 text-right text-gray-700 text-sm">
                      {item.totalQty.toLocaleString()}
                    </td>

                    {/* 剩余库存 */}
                    <td style={{ ...lastFixedStyle(), background: rowBg }} className="px-3 py-3 text-right font-medium">
                      <span className={item.remaining > 0 ? 'text-green-600' : 'text-gray-400'}>
                        {item.remaining.toLocaleString()}
                      </span>
                    </td>

                    {/* 动态出库列 */}
                    {data.columns.map((col) => {
                      const qty = item.shipments[col.key];
                      return (
                        <td
                          key={col.key}
                          style={{ width: DYNAMIC_COL_WIDTH }}
                          className="px-3 py-3 text-center text-gray-700"
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

                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>
      )}
    </div>
  );
}
