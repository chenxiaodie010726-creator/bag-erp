'use client';
/* ============================================================
 * 新建套装弹窗
 * ============================================================ */

import { useState } from 'react';
import type { SetItem } from './mockData';
import { CURRENCY_OPTIONS } from './mockData';

export interface AddSetPayload {
  sku: string;
  name: string;
  components: string[];
  colors: string[];
  bulkPrice: number;
  dropshipPrice: number;
  currency: string;
  packWeight: string;
  packSize: string;
  status: 'active' | 'discontinued';
}

interface AddSetModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: AddSetPayload) => void;
}

export default function AddSetModal({ open, onClose, onConfirm }: AddSetModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [componentsText, setComponentsText] = useState('');
  const [colorsText, setColorsText] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [dropshipPrice, setDropshipPrice] = useState('');
  const [currency, setCurrency] = useState<string>('USD');
  const [packWeight, setPackWeight] = useState('');
  const [packSize, setPackSize] = useState('');
  const [status, setStatus] = useState<'active' | 'discontinued'>('active');

  if (!open) return null;

  function handleConfirm() {
    if (!sku.trim() || !name.trim()) return;
    const components = componentsText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const colors = colorsText
      .split(/[,，\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    onConfirm({
      sku: sku.trim(),
      name: name.trim(),
      components,
      colors,
      bulkPrice: parseFloat(bulkPrice) || 0,
      dropshipPrice: parseFloat(dropshipPrice) || 0,
      currency,
      packWeight: packWeight.trim(),
      packSize: packSize.trim(),
      status,
    });
    /* reset */
    setSku(''); setName(''); setComponentsText(''); setColorsText('');
    setBulkPrice(''); setDropshipPrice(''); setCurrency('USD');
    setPackWeight(''); setPackSize(''); setStatus('active');
  }

  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
  const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">新建套装</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {/* 表单 */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>套装 SKU <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="如 CITYBAG-3SET"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>产品名称 <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="如 城市包三件套"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>包含纸格款号（每行或逗号分隔）</label>
            <textarea
              rows={4}
              placeholder={'CITYBAG-AP1\nCROSS-2024-05\nWALLET-2024-07'}
              value={componentsText}
              onChange={(e) => setComponentsText(e.target.value)}
              className={`${inputCls} resize-none`}
            />
            {componentsText.trim() && (
              <p className="text-xs text-gray-400 mt-1">
                共 {componentsText.split(/[,，\n]/).filter((s) => s.trim()).length} 个款号
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>可选颜色（颜色代码，空格或逗号分隔）</label>
            <input
              type="text"
              placeholder="BLK BRN NAV TAN"
              value={colorsText}
              onChange={(e) => setColorsText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>大货价</label>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>一件代发价</label>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={dropshipPrice}
                onChange={(e) => setDropshipPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>采购币种</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputCls}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>包装重量</label>
              <input
                type="text"
                placeholder="如 1.50 kg"
                value={packWeight}
                onChange={(e) => setPackWeight(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>包装尺寸</label>
              <input
                type="text"
                placeholder="如 30*22*15 cm"
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>状态</label>
            <div className="flex items-center gap-4">
              {(['active', 'discontinued'] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="radio"
                    name="add-set-status"
                    value={s}
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="w-4 h-4"
                  />
                  {s === 'active' ? '启用' : '停用'}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button
            type="button"
            disabled={!sku.trim() || !name.trim()}
            onClick={handleConfirm}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              sku.trim() && name.trim()
                ? 'bg-gray-900 text-white hover:bg-gray-700'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed',
            ].join(' ')}
          >
            创建套装
          </button>
        </div>
      </div>
    </div>
  );
}
