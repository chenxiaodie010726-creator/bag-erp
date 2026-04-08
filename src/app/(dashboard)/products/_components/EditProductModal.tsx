'use client';

/* ============================================================
 * 编辑产品信息弹窗
 * 字段：款号 / 名称 / 分类 / 币种 / 包装 / 价格
 * 可选：同步更新所有 SKU 价格
 * 危险区：停用 / 启用产品（需要二次确认）
 * ============================================================ */

import { useState, useEffect } from 'react';
import type { ProductListItem } from './mockData';
import { CATEGORY_OPTIONS } from './mockData';

export interface EditProductPatch {
  patternCode: string;
  name: string;
  category: string;
  currency: string;
  packWeight: string;
  packSize: string;
  bulkPrice: number;
  dropshipPrice: number;
}

interface EditProductModalProps {
  open: boolean;
  product: ProductListItem | null;
  onClose: () => void;
  onConfirm: (productId: string, patch: EditProductPatch, syncSkuPrices: boolean) => void;
  onToggleStatus: (productId: string) => void;
}

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
const CATEGORIES = CATEGORY_OPTIONS.filter((c) => c !== '全部');

export default function EditProductModal({
  open,
  product,
  onClose,
  onConfirm,
  onToggleStatus,
}: EditProductModalProps) {
  const [patternCode, setPatternCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('手袋');
  const [currency, setCurrency] = useState('USD');
  const [packWeight, setPackWeight] = useState('');
  const [packSize, setPackSize] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [dropshipPrice, setDropshipPrice] = useState('');
  const [syncPrices, setSyncPrices] = useState(true);
  /* 危险操作的二次确认状态 */
  const [confirmingStop, setConfirmingStop] = useState(false);

  useEffect(() => {
    if (open && product) {
      setPatternCode(product.patternCode);
      setName(product.name);
      setCategory(product.category);
      setCurrency(product.currency);
      setPackWeight(product.packWeight);
      setPackSize(product.packSize);
      setBulkPrice(String(product.bulkPrice));
      setDropshipPrice(String(product.dropshipPrice));
      setSyncPrices(true);
      setConfirmingStop(false);
    }
  }, [open, product]);

  const isValid = patternCode.trim() && name.trim() &&
    Number.isFinite(Number(bulkPrice)) && Number.isFinite(Number(dropshipPrice));

  function handleConfirm() {
    if (!product || !isValid) return;
    onConfirm(product.id, {
      patternCode: patternCode.trim(),
      name: name.trim(),
      category,
      currency: currency.trim() || 'USD',
      packWeight: packWeight.trim(),
      packSize: packSize.trim(),
      bulkPrice: Number(bulkPrice),
      dropshipPrice: Number(dropshipPrice),
    }, syncPrices);
    onClose();
  }

  function handleToggleStatus() {
    if (!product) return;
    if (product.status === 'active') {
      /* 停用：先进入二次确认状态 */
      if (!confirmingStop) { setConfirmingStop(true); return; }
      /* 二次确认通过：执行停用 */
      onToggleStatus(product.id);
      onClose();
    } else {
      /* 启用：直接执行 */
      onToggleStatus(product.id);
      onClose();
    }
  }

  if (!open || !product) return null;

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white';
  const isActive = product.status === 'active';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-800">编辑产品信息</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.patternCode} · {product.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">

          {/* 款号 + 名称 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">纸格款号</label>
              <input type="text" value={patternCode} onChange={(e) => setPatternCode(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">产品名称</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 分类 + 币种 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">分类</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">采购币种</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* 包装重量 + 包装尺寸 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">包装重量</label>
              <input type="text" placeholder="如 0.85 kg" value={packWeight} onChange={(e) => setPackWeight(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">包装尺寸</label>
              <input type="text" placeholder="如 25×18×12 cm" value={packSize} onChange={(e) => setPackSize(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 大货价 + 代发价 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">大货价</label>
              <input type="number" min={0} step={0.01} value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">一件代发价</label>
              <input type="number" min={0} step={0.01} value={dropshipPrice} onChange={(e) => setDropshipPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className={inputCls} />
            </div>
          </div>

          {/* 同步 SKU 价格 */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={syncPrices}
              onChange={(e) => setSyncPrices(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-600">同步更新该款式下所有 SKU 的价格</span>
          </label>

          {/* 危险区：停用 / 启用产品 */}
          <div className="pt-2 border-t border-dashed border-gray-200">
            <p className="text-xs text-gray-400 mb-2">危险操作</p>
            {isActive ? (
              confirmingStop ? (
                /* 二次确认 */
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <span className="text-sm text-red-700 flex-1">
                    停用后该产品及其下所有 SKU 均不可用，确认吗？
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmingStop(false)}
                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors shrink-0"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleStatus}
                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium shrink-0"
                  >
                    确认停用
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleStatus}
                  className="px-3 py-2 text-sm text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                >
                  停用产品
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={handleToggleStatus}
                className="px-3 py-2 text-sm text-green-600 border border-green-200 rounded-md hover:bg-green-50 transition-colors"
              >
                启用产品
              </button>
            )}
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
            disabled={!isValid}
            className={[
              'px-5 py-2 text-sm font-medium rounded-md transition-colors',
              isValid ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
