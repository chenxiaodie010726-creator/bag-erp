'use client';
/* ============================================================
 * 编辑套装弹窗
 * ============================================================ */

import { useState, useEffect } from 'react';
import type { SetItem } from './mockData';
import { CURRENCY_OPTIONS } from './mockData';

export interface EditSetPatch {
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

interface EditSetModalProps {
  open: boolean;
  item: SetItem | null;
  onClose: () => void;
  onConfirm: (id: string, patch: EditSetPatch) => void;
}

export default function EditSetModal({ open, item, onClose, onConfirm }: EditSetModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [componentsText, setComponentsText] = useState('');
  const [colorsText, setColorsText] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [dropshipPrice, setDropshipPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [packWeight, setPackWeight] = useState('');
  const [packSize, setPackSize] = useState('');
  const [status, setStatus] = useState<'active' | 'discontinued'>('active');
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    if (item) {
      setSku(item.sku);
      setName(item.name);
      setComponentsText(item.components.join('\n'));
      setColorsText(item.colors.join(' '));
      setBulkPrice(item.bulkPrice.toString());
      setDropshipPrice(item.dropshipPrice.toString());
      setCurrency(item.currency);
      setPackWeight(item.packWeight);
      setPackSize(item.packSize);
      setStatus(item.status);
      setConfirmStop(false);
    }
  }, [item]);

  if (!open || !item) return null;

  function handleConfirm() {
    if (!item || !sku.trim() || !name.trim()) return;
    const components = componentsText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const colors = colorsText
      .split(/[,，\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    onConfirm(item.id, {
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
          <h2 className="text-base font-semibold text-gray-800">编辑套装</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {/* 表单 */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>套装 SKU</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>产品名称</label>
              <input
                type="text"
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
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className={inputCls}
              />
            </div>
          </div>

          {/* Danger Zone */}
          <div className="border border-red-100 rounded-lg p-4 bg-red-50/40 mt-2">
            <p className="text-xs font-semibold text-red-400 mb-3">危险操作</p>
            {status === 'active' ? (
              !confirmStop ? (
                <button
                  type="button"
                  onClick={() => setConfirmStop(true)}
                  className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                >
                  停用该套装
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-600">确认停用？停用后不可在订单中选用此套装。</span>
                  <button
                    type="button"
                    onClick={() => { setStatus('discontinued'); setConfirmStop(false); }}
                    className="px-3 py-1.5 text-xs text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
                  >
                    确认停用
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmStop(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => setStatus('active')}
                className="px-3 py-1.5 text-xs text-green-600 border border-green-200 rounded-md hover:bg-green-50 transition-colors"
              >
                重新启用套装
              </button>
            )}
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
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}
