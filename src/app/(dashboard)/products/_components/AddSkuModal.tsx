'use client';

/* ============================================================
 * 添加 SKU 弹窗
 * - 颜色：左侧 OS 色盘取色 / 右侧常用颜色快捷选
 * - SKU Code 由客户提供，完全自由填写
 * - 价格默认引用父产品价格，可覆盖
 * ============================================================ */

import { useState, useEffect, useRef } from 'react';
import type { ProductListItem } from './mockData';
import { COLOR_MAP, COLOR_NAME_MAP, COLOR_NAME_ZH_MAP } from './mockData';

export interface AddSkuPayload {
  skuCode: string;
  colorCode: string;
  colorNameZh: string;
  stock: number;
  bulkPrice: number;
  dropshipPrice: number;
  status: 'active' | 'discontinued';
}

interface AddSkuModalProps {
  open: boolean;
  product: ProductListItem | null;
  onClose: () => void;
  onConfirm: (productId: string, payload: AddSkuPayload) => void;
}

const LIGHT_COLORS = new Set(['WHT', 'CRM', 'LPK', 'LBL', 'BGE']);
const COLOR_CODES = Object.keys(COLOR_MAP);

/** 获取颜色代码对应的 CSS 颜色值 */
function resolveHex(code: string): string {
  return COLOR_MAP[code] ?? (code.startsWith('#') ? code : '#9ca3af');
}

/** 根据十六进制颜色判断是否为浅色 */
function isHexLight(hex: string): boolean {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  } catch { return false; }
}

export default function AddSkuModal({ open, product, onClose, onConfirm }: AddSkuModalProps) {
  /* 颜色：colorCode 是存储的代码（BLK / #ff5500 / 客户编号）；pickerHex 是 input[type=color] 的值 */
  const [colorCode, setColorCode] = useState('BLK');
  const [pickerHex, setPickerHex] = useState(COLOR_MAP['BLK']);
  const [colorNameZh, setColorNameZh] = useState(COLOR_NAME_ZH_MAP['BLK']);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const [skuCode, setSkuCode] = useState('');
  const [stock, setStock] = useState('0');
  const [bulkPrice, setBulkPrice] = useState('');
  const [dropshipPrice, setDropshipPrice] = useState('');
  const [status, setStatus] = useState<'active' | 'discontinued'>('active');

  useEffect(() => {
    if (open && product) {
      setColorCode('BLK');
      setPickerHex(COLOR_MAP['BLK']);
      setColorNameZh(COLOR_NAME_ZH_MAP['BLK'] ?? '');
      setSkuCode('');
      setStock('0');
      setBulkPrice(String(product.bulkPrice));
      setDropshipPrice(String(product.dropshipPrice));
      setStatus('active');
    }
  }, [open, product]);

  /* 从 OS 色盘选色 */
  function handlePickerChange(hex: string) {
    setPickerHex(hex);
    setColorCode(hex);
  }

  /* 点击常用颜色预设 */
  function handlePresetClick(code: string) {
    setColorCode(code);
    setPickerHex(COLOR_MAP[code] ?? COLOR_MAP['BLK']);
    /* 自动填入中文名称（若用户尚未手动修改则覆盖） */
    setColorNameZh(COLOR_NAME_ZH_MAP[code] ?? '');
  }

  /* 手动编辑颜色编号文本框 */
  function handleColorCodeInput(val: string) {
    setColorCode(val);
    const resolved = resolveHex(val.trim());
    if (resolved !== '#9ca3af') setPickerHex(resolved);
  }

  function handleConfirm() {
    if (!product) return;
    const bulk = Number(bulkPrice);
    const drop = Number(dropshipPrice);
    const stockNum = Number(stock);
    if (!skuCode.trim() || !Number.isFinite(bulk) || !Number.isFinite(drop) || !Number.isFinite(stockNum)) return;
    onConfirm(product.id, {
      skuCode: skuCode.trim(),
      colorCode: colorCode.trim() || 'BLK',
      colorNameZh: colorNameZh.trim(),
      stock: stockNum,
      bulkPrice: bulk,
      dropshipPrice: drop,
      status,
    });
    onClose();
  }

  if (!open || !product) return null;

  const currentHex = resolveHex(colorCode);
  const currentIsLight = LIGHT_COLORS.has(colorCode) || isHexLight(currentHex);
  const presetName = COLOR_NAME_MAP[colorCode];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      /* 仅点击遮罩层本身才关闭 */
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      /* 阻止键盘事件向后方 DOM 冒泡，防止触发表格行的快捷键 */
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden"
        /* 阻止冒泡，避免点击内容区域时触发遮罩关闭 */
        onMouseDown={(e) => e.stopPropagation()}
      >

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-800">添加 SKU</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.patternCode} · {product.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[72vh] overflow-y-auto">

          {/* ===== 颜色区域 ===== */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">颜色</label>
            <div className="flex gap-3">

              {/* 左：OS 色盘 */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <p className="text-[11px] text-gray-400">自定义</p>
                <label className="cursor-pointer" title="点击打开系统色盘">
                  {/* 大色块可视化展示，点击触发隐藏的 input[type=color] */}
                  <div
                    className="w-16 h-16 rounded-xl shadow-md transition-transform hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: pickerHex,
                      border: currentIsLight ? '1.5px solid #d1d5db' : 'none',
                    }}
                  />
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={pickerHex}
                    onChange={(e) => handlePickerChange(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                  />
                </label>
              </div>

              {/* 右：常用颜色预设 */}
              <div className="flex-1">
                <p className="text-[11px] text-gray-400 mb-1.5">常用颜色</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_CODES.map((code) => {
                    const hex = COLOR_MAP[code];
                    const isLight = LIGHT_COLORS.has(code);
                    const selected = colorCode === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        title={`${code} — ${COLOR_NAME_MAP[code] ?? code}`}
                        onClick={() => handlePresetClick(code)}
                        className={[
                          'w-6 h-6 rounded-md transition-all shrink-0',
                          selected ? 'ring-2 ring-offset-1 ring-gray-900 scale-110' : 'hover:scale-110',
                        ].join(' ')}
                        style={{
                          backgroundColor: hex,
                          border: isLight ? '1px solid #d1d5db' : 'none',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 颜色编号 */}
            <div className="mt-3 flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-md shrink-0"
                style={{
                  backgroundColor: currentHex,
                  border: currentIsLight ? '1px solid #d1d5db' : 'none',
                }}
              />
              <input
                type="text"
                value={colorCode}
                onChange={(e) => handleColorCodeInput(e.target.value)}
                placeholder="颜色编号（如 BLK / #ff5500 / 客户提供的编号）"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              {presetName && (
                <span className="text-xs text-gray-400 shrink-0">{presetName}</span>
              )}
            </div>
            {/* 中文颜色名称（可选） */}
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0 w-20">中文名</label>
              <input
                type="text"
                value={colorNameZh}
                onChange={(e) => setColorNameZh(e.target.value)}
                placeholder="如 黑色、荧光粉（可留空）"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* ===== SKU Code ===== */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              SKU Code
              <span className="text-gray-400 font-normal ml-1">（由客户提供，如实填写）</span>
            </label>
            <input
              type="text"
              value={skuCode}
              onChange={(e) => setSkuCode(e.target.value)}
              placeholder="如 AP1-BC-BLK"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {/* ===== 库存 ===== */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">初始库存</label>
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {/* ===== 价格 ===== */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                大货价
                <span className="text-gray-400 font-normal ml-1">引用产品价格</span>
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                一件代发价
                <span className="text-gray-400 font-normal ml-1">引用产品价格</span>
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={dropshipPrice}
                onChange={(e) => setDropshipPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>

          {/* ===== 状态 ===== */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'discontinued')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
            >
              <option value="active">启用</option>
              <option value="discontinued">停用</option>
            </select>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!skuCode.trim()}
            className={[
              'px-5 py-2 text-sm font-medium rounded-md transition-colors',
              skuCode.trim()
                ? 'bg-gray-900 text-white hover:bg-gray-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            添加 SKU
          </button>
        </div>
      </div>
    </div>
  );
}
